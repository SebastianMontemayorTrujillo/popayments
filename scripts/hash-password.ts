import { stdin, stdout } from 'node:process';
import { hashPassword } from '../src/shared/session';

let password = '';
for await (const chunk of stdin) {
  password += chunk.toString();
  if (password.length > 1024) throw new Error('La contraseña es demasiado larga');
}
stdout.write(`${await hashPassword(password.replace(/\r?\n$/, ''))}\n`);
