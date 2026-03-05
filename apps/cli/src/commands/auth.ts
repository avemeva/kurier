import type { Command } from 'commander';
import { strip, success } from '../output';
import { pending } from '../pending';
import { slimAuthState, slimUser } from '../slim';

export function register(parent: Command): void {
  const auth = parent
    .command('auth')
    .description('Check auth state or authenticate (phone/code/password/logout)')
    .action(() => {
      pending.action = async (client) => {
        const state = await client.getAuthState();
        if (state.ready) {
          const me = await client.invoke({ _: 'getMe' });
          success({ ...state, ...(strip(slimUser(me)) as Record<string, unknown>) });
        } else {
          success(slimAuthState(state));
        }
      };
    });

  auth
    .command('phone')
    .description('Submit phone number')
    .argument('<number>', 'Phone number (e.g. +1234567890)')
    .action((phone: string) => {
      pending.action = async (client) => {
        const state = await client.submitPhone(phone);
        success(slimAuthState(state));
      };
    });

  auth
    .command('code')
    .description('Submit verification code')
    .argument('<code>', 'Verification code')
    .action((code: string) => {
      pending.action = async (client) => {
        const state = await client.submitCode(code);
        success(slimAuthState(state));
      };
    });

  auth
    .command('password')
    .description('Submit 2FA password')
    .argument('<password>', '2FA password')
    .action((password: string) => {
      pending.action = async (client) => {
        const state = await client.submitPassword(password);
        success(slimAuthState(state));
      };
    });

  auth
    .command('logout')
    .description('Log out of Telegram')
    .action(() => {
      pending.action = async (client) => {
        const res = await client.invoke({ _: 'logOut' });
        success(strip(res));
      };
    });
}
