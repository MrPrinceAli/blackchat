// English UI text (sentence case), the default language (D-024). Same shape as strings.id.ts.
// Values with parameters are functions; no HTML here (rendered as text nodes).
import type { Strings } from './strings.id';

const at = (username: string): string => `@${username}`;

export const en: Strings = {
  appName: 'blackchat',

  language: {
    label: 'Language',
    en: 'English',
    id: 'Bahasa Indonesia',
  },

  welcome: {
    taglineMessages: 'Messages that burn after reading.',
    taglineAccount: 'Accounts that expire in 3 days.',
    createAccount: 'Create account',
    signIn: 'Sign in',
    incognitoHint: 'For best privacy, open in an incognito window without extensions.',
    eyebrow: 'secret archive · end-to-end',
    edition: 'e2ee · no logs',
    specs: ['burns in 3–10 s', 'expires in 72 h', 'no email', 'zero plaintext on server'],
    preview: {
      label: 'preview',
      peer: '@rara',
      message: '8 pm at the usual place',
      reply: 'ok, on my way',
      watermark: 'PREVIEW',
      footer: 'Keys only live on this device.',
    },
    stack: [
      { name: 'x25519', role: 'key exchange' },
      { name: 'ed25519', role: 'signatures' },
      { name: 'xchacha20-poly1305', role: 'message encryption' },
      { name: 'argon2id', role: 'password key' },
    ],
    stackLabel: 'cryptography in use',
  },

  register: {
    title: 'Create account',
    subtitle: 'Just a username and password. No email, no phone number.',
    haveAccount: 'Already have an account?',
    toLogin: 'Sign in here',
    strength: (level: number) =>
      ['Too short, at least 10 characters.', 'Fair.', 'Strong.', 'Very strong.'][level] ?? '',
    username: 'Username',
    usernameHint: 'Lowercase letters, digits, or underscore. 3–20 characters.',
    available: 'Available',
    taken: 'Already taken',
    password: 'Password',
    passwordHint: 'At least 10 characters.',
    repeatPassword: 'Repeat password',
    submit: 'Create account',
    securing: 'Securing account...',
    warning:
      'There is no password recovery. Your account and all messages expire automatically 3 days after creation.',
    errors: {
      usernameFormat:
        'Usernames may only use lowercase letters, digits, and underscore (3–20 characters).',
      tooShort: 'Password must be at least 10 characters.',
      sameAsUsername: 'Password must not be the same as the username.',
      common: 'This password is too common. Choose another.',
      mismatch: 'Passwords do not match.',
      taken: 'That username is already taken.',
      rateLimited: 'Too many attempts. Try again later.',
      generic: 'Could not create the account. Try again.',
    },
  },

  login: {
    title: 'Sign in',
    subtitle: 'Your account key is unlocked on this device. Your password is never sent.',
    noAccount: 'No account yet?',
    toRegister: 'Create one',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    working: 'Unlocking account...',
    error: 'Wrong username or password.',
    rateLimited: (seconds: number) => `Too many attempts. Try again in ${seconds} seconds.`,
  },

  home: {
    searchPlaceholder: 'Search username...',
    searchLabel: 'Search username',
    search: 'Search',
    start: 'Start conversation',
    settings: 'Settings',
    empty: 'No conversations yet. Search for a username to start.',
    unread: (n: number) => `${n} unopened`,
    chooseTimer: 'Choose burn timer',
    self: "That's your own username.",
    invalidPeer: "This account's key is invalid. The conversation can't be started.",
    startFailed: 'Could not start the conversation. Try again.',
    loading: 'Loading conversations...',
    signedInAs: 'signed in as',
    expiresIn: 'expires in',
    conversations: 'conversations',
  },

  pane: {
    title: 'Pick a conversation',
    body: 'Open a conversation from the list on the left, or search for a username to start. Every message burns after it is read.',
    eyebrow: 'end-to-end encrypted · no trace',
    shortcuts: [
      ['Enter', 'send message'],
      ['Shift + Enter', 'new line'],
      ['Shift + F10', 'own message menu'],
      ['Esc', 'close menu'],
    ],
  },

  timer: {
    seconds: (ttl: number) => `${ttl} sec`,
    label: (ttl: number) => `${ttl} seconds`,
    propose: 'Propose a new timer',
    proposal: (username: string, ttl: number) =>
      `${at(username)} wants to change the timer to ${ttl} seconds.`,
    accept: 'Accept',
    reject: 'Decline',
    waiting: (ttl: number) => `Waiting for approval of the ${ttl}-second timer.`,
    simultaneous: (ttl: number) =>
      `You both started at the same time. The timer is ${ttl} seconds.`,
    changed: (ttl: number) => `Timer is now ${ttl} seconds.`,
    rejected: 'Timer proposal declined.',
    submit: 'Propose',
    cancel: 'Cancel',
  },

  chat: {
    statusEncrypted: 'end-to-end encrypted',
    statusVerified: 'key verified',
    e2eNote: (ttl: number) => `End-to-end encrypted · burns ${ttl} sec after reading`,
    back: 'Back',
    verify: 'Verify',
    menu: 'Conversation menu',
    block: (username: string) => `Block ${at(username)}`,
    blockAction: 'Block',
    cancel: 'Cancel',
    verified: 'Verified',
    blockConfirm: (username: string) =>
      `Block ${at(username)}? All messages in this conversation are deleted and future messages from this account will not be shown.`,
    composerPlaceholder: 'Write a message...',
    composerLabel: 'Write a message',
    attach: 'Attach image',
    send: 'Send',
    notOpened: 'Not opened',
    queued: 'Waiting its turn',
    burned: 'Burned',
    retracted: 'Message withdrawn',
    sending: 'Sending...',
    uploading: (done: number, total: number) => `Sending image ${done}/${total}`,
    imageFailed: "The image can't be shown.",
    secondsLeft: (s: number) => `${s} seconds left`,
    retract: 'Withdraw message',
    retractSeen: 'Already seen. The message is still deleted on both sides.',
    imageAlt: 'Secret image',
    sendFailed: 'The message could not be sent. Try again.',
    blockSoon: 'Blocking is coming soon.',
  },

  verify: {
    title: 'Verify',
    description: (username: string) =>
      `Compare these numbers with ${at(username)} in person. If they match, nobody is intercepting your conversation.`,
    mark: 'Mark as verified',
    verified: 'Verified',
    numberLabel: 'safety number · 60 digits',
    qrLabel: (username: string) => `or scan from ${at(username)}'s device`,
  },

  settings: {
    title: 'Settings',
    theme: 'Theme',
    themeSystem: 'System',
    themeDark: 'Dark',
    themeLight: 'Light',
    changePassword: 'Change password',
    signOut: 'Sign out',
    deleteNow: 'Delete account now',
    deleteConfirm: (username: string) =>
      `Type ${username} to delete this account and all of its messages.`,
    deleting: 'Deleting conversations...',
    deleteFailed: 'Could not delete the account. Try again.',
    currentPassword: 'Current password',
    newPassword: 'New password',
    wrongPassword: 'The current password is wrong.',
    passwordChanged: 'Password changed.',
    sectionDisplay: 'display',
    sectionLanguage: 'language',
    sectionAccount: 'account',
    sectionDanger: 'danger zone',
    dangerNote: 'All conversations are deleted from the server. This cannot be undone.',
  },

  expired: {
    message: 'This account has expired. All messages have been deleted.',
    createNew: 'Create a new account',
    eyebrow: 'account lifetime over · 72 hours',
  },

  account: {
    clockLabel: 'Account time left',
    warning: (span: string) => `Account expires in ${span}. All messages go with it.`,
    spans: { day: '24 hours', hour: '1 hour', fiveMinutes: '5 minutes' },
    units: { day: 'd', hour: 'h', minute: 'm', second: 's' },
  },

  session: {
    lockWarning: 'The session will lock in 60 seconds due to inactivity.',
    stay: 'Stay signed in',
    otherTab: 'This account is open in another tab.',
    useHere: 'Use here',
    reconnecting: 'Reconnecting...',
    locked: 'Session locked due to inactivity. Sign in again to continue.',
  },

  errors: {
    usernameNotFound: 'Username not found. It may have expired.',
    keyChanged: (username: string) =>
      `${at(username)} now uses a different key. This may be a new account with the same username.`,
    roomFull: 'Too many unopened messages in this conversation.',
    imageTooLarge: 'Images are limited to 15 MB.',
    imageUnreadable: "The image can't be read.",
    captionTooLong: 'Captions are limited to 300 characters.',
    peerGone: (username: string) => `The account ${at(username)} no longer exists.`,
    quotaExceeded: 'This account has reached its image sending limit.',
  },
};
