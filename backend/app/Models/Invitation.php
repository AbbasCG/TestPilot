<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Invitation extends Model
{
    protected $guarded = ['*'];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'accepted_at' => 'datetime', 'revoked_at' => 'datetime', 'last_sent_at' => 'datetime'];
    }

    /** pending | accepted | revoked | expired (expiry is derived from expires_at). */
    public function state(): string
    {
        return $this->status === 'pending' && $this->expires_at->isPast() ? 'expired' : $this->status;
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }
}
