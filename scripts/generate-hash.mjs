import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/generate-hash.mjs "yourpassword"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\nGenerated bcrypt hash:\n');
console.log(hash);
console.log('\nSet this as AUTH_PASSWORD_HASH in your environment variables.\n');
