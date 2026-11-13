<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'status_reason'])]
class User extends Authenticatable
{
    /** Mirrors the column defaults so new in-memory instances are consistent. */
    protected $attributes = ['status' => 'active', 'must_change_password' => false, 'version' => 1];

    public function projects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_members')->withPivot('role')->withTimestamps();
    }

    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'must_change_password' => 'boolean',
            'password_changed_at' => 'datetime',
            'last_login_at' => 'datetime',
            'status_changed_at' => 'datetime',
        ];
    }

    public function isPlatformOwner(): bool
    {
        return $this->platform_role === 'owner';
    }

    /** Platform owners and admins may manage accounts. */
    public function isPlatformAdmin(): bool
    {
        return in_array($this->platform_role, ['owner', 'admin'], true);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /** active | must_change_password | suspended | disabled */
    public function accountState(): string
    {
        if (! $this->isActive()) {
            return $this->status;
        }

        return $this->must_change_password ? 'must_change_password' : 'active';
    }

    /**
     * Safe self representation for /api/user and login: no hashes, tokens or reasons.
     *
     * @return array<string, mixed>
     */
    public function toSelfArray(): array
    {
        return [
            'id' => $this->id, 'name' => $this->name, 'email' => $this->email,
            'platform_role' => $this->platform_role, 'status' => $this->status,
            'must_change_password' => (bool) $this->must_change_password,
            'password_changed_at' => $this->password_changed_at,
        ];
    }
}
