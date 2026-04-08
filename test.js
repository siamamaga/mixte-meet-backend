

const bcrypt = require('bcryptjs');

const hash = '$2a$12$8crmMp6b0WGsJNhTdHQhDONvKqxHn50Miztxa96bGMJaIfTh7zmZ6
I';
const password = 'siama26200@';
bcrypt.compare(password, hash).then(result => {
  console.log('Match:', result);
});
