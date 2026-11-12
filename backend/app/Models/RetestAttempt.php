<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RetestAttempt extends Model
{
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'verified' => 'boolean', 'executed_at' => 'datetime'];
    }
}
