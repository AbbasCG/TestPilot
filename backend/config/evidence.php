<?php

/*
 * Evidence uploads are stored on the private "evidence" disk and are only
 * reachable through the authorized download endpoint. Every accepted type is
 * verified by content (finfo + magic bytes); images are decoded and re-encoded
 * to strip metadata and polyglot payloads. SVG/HTML and executables are never
 * accepted.
 */
return [
    'limits' => [
        'screenshot' => 8 * 1024 * 1024,
        'video' => 40 * 1024 * 1024,
        'attachment' => 10 * 1024 * 1024,
    ],
    'max_image_pixels' => 16_000_000,
    'max_per_owner' => 20,
    'types' => [
        'screenshot' => [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
        ],
        'video' => [
            'video/mp4' => 'mp4',
            'video/webm' => 'webm',
        ],
        'attachment' => [
            'application/pdf' => 'pdf',
            'text/plain' => 'txt',
            'text/csv' => 'csv',
            'application/json' => 'json',
        ],
    ],
    'inline' => ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
];
