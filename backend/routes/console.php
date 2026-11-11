<?php

use App\Jobs\RecordQueueHeartbeat;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('testpilot:queue-probe', function () {
    RecordQueueHeartbeat::dispatch();
    $this->info('Queue heartbeat dispatched.');
})->purpose('Dispatch a background queue health probe');

Schedule::job(new RecordQueueHeartbeat)->everyFiveMinutes()->withoutOverlapping();
