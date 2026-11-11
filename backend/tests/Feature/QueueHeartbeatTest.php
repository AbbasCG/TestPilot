<?php

namespace Tests\Feature;

use App\Jobs\RecordQueueHeartbeat;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class QueueHeartbeatTest extends TestCase
{
    public function test_heartbeat_is_persisted_with_expiry(): void
    {
        RecordQueueHeartbeat::dispatchSync();
        $this->assertNotNull(Cache::get('testpilot:queue:last-heartbeat'));
        $this->travel(16)->minutes();
        $this->assertNull(Cache::get('testpilot:queue:last-heartbeat'));
    }
}
