// Supabase project config for friends-app
const SUPABASE_URL = 'https://gzxncrqzsjmofvbdmhva.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kRkmFYtYV62Yvuy5Zxzwbg_K5RlDKw5';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Generates a random 6-digit ID number that avoids "fancy"/patterned numbers
// (e.g. all-same-digit like 111111, or obviously repeating blocks like 111555)
// — those stay reserved for a future paid custom-ID feature.
function generatePlainIdNumber() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const n = Math.floor(100000 + Math.random() * 900000).toString();
    const digits = n.split('');
    const allSame = digits.every(d => d === digits[0]);
    const isPattern = /^(\d)\1{2}(\d)\2{2}$/.test(n); // e.g. 111555
    if (!allSame && !isPattern) return n;
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}
