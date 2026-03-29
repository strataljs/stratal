import messages from './i18n/messages';

declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env { }
}

type Messages = typeof messages['en'];

declare module 'stratal/i18n' {
  interface AppMessages extends Messages { }
}
