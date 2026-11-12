<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Environment extends Model
{
    protected $fillable = ['name', 'url'];

    protected function casts(): array
    {
        return ['archived' => 'boolean'];
    }
}
