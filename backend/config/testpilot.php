<?php

return [
    /*
    | Outgoing mail for invitations and password resets. Keep false until a real
    | mailer is configured: with mail disabled, invitation links are shown once
    | to the inviter and password-reset requests explain that mail is not set
    | up. Nothing is ever written to logs (the "log" mailer would leak tokens).
    */
    'mail_enabled' => (bool) env('TESTPILOT_MAIL_ENABLED', false),

    // Public origin of the SPA, used to build links in e-mails.
    'frontend_url' => rtrim((string) env('FRONTEND_URL', env('APP_URL', 'http://localhost')), '/'),

    'invitation_ttl_hours' => (int) env('INVITATION_TTL_HOURS', 168),
    'invitations_per_hour' => (int) env('INVITATIONS_PER_HOUR', 30),
    'admin_actions_per_minute' => (int) env('ADMIN_ACTIONS_PER_MINUTE', 30),
];
