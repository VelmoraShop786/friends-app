// Supabase Edge Function: livekit-token
// Verifies the caller is a logged-in Supabase user, then issues a LiveKit
// access token for them to join a voice room. The LiveKit API secret
// never leaves this server-side function.
//
// Two kinds of voice room:
//   1) A chat ROOM (body: { room: "111" })
//        - Everyone who is allowed in the room can LISTEN.
//        - Only a person who is sitting on a seat right now can SPEAK.
//        - Banned or currently kicked people get no token at all.
//   2) A LUDO GAME (body: { game: "<game id>" })
//        - The real players of that running game can speak and listen.
//        - A friend who is watching (spectator) can only LISTEN, never speak.
//        - Everybody else gets no token.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@^2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return reply({ error: "Missing authorization header" }, 401);
    }

    // Verify the requester's Supabase session using their own JWT
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return reply({ error: "Unauthorized" }, 401);
    }

    // Pull the display name from their profile so LiveKit shows a real name
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();

    let roomName = "111";
    let gameId: string | null = null;
    try {
      const body = await req.json();
      if (body?.game) gameId = String(body.game);
      else if (body?.room) roomName = String(body.room);
    } catch (_e) {
      // no body sent — default room is fine
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !livekitUrl) {
      return reply({ error: "Server misconfigured: missing LiveKit secrets" }, 500);
    }

    let canPublish = false;
    let ttl = "6h";

    if (gameId) {
      // ---- Ludo game voice: only the real players of this running game ----
      if (!UUID.test(gameId)) {
        return reply({ error: "Bad game id" }, 400);
      }
      const { data: ok, error: okError } = await supabaseClient.rpc("ludo_voice_ok", { p_game: gameId });
      if (!okError && ok === true) {
        canPublish = true;                         // a player: speaks and listens
      } else {
        // not a player: a friend who is watching the game may LISTEN only
        const { data: listen } = await supabaseClient.rpc("ludo_listen_ok", { p_game: gameId });
        if (listen !== true) {
          return reply({ error: "You are not in this game" }, 403);
        }
        canPublish = false;
      }
      roomName = "ludo-" + gameId;
      ttl = "2h";
    } else {
      // ---- Chat room voice (unchanged) ----
      // Banned or kicked people can't join the room's voice at all.
      // (These reads use the caller's own session, so the normal row-level rules apply.)
      const { data: member } = await supabaseClient
        .from("room_members")
        .select("banned, kicked_until")
        .eq("room_id", roomName)
        .eq("user_id", user.id)
        .maybeSingle();

      if (member && (member.banned || (member.kicked_until && new Date(member.kicked_until) > new Date()))) {
        return reply({ error: "You cannot join this room right now" }, 403);
      }

      // Only someone sitting on a seat gets permission to speak. Everyone else is listen-only.
      const { data: seatRows } = await supabaseClient
        .from("room_seats")
        .select("seat_number")
        .eq("room_id", roomName)
        .eq("occupied_by", user.id)
        .limit(1);

      canPublish = !!(seatRows && seatRows.length > 0);
      // speaking tokens are short-lived: when someone leaves their seat the app reconnects them as a listener
      ttl = canPublish ? "1h" : "6h";
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: profile?.name || "User",
      ttl,
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish,
      canPublishData: false,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    return reply({ token, url: livekitUrl, canPublish });
  } catch (e) {
    return reply({ error: String(e) }, 500);
  }
});
