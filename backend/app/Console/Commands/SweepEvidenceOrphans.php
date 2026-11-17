<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Removes evidence files that exist on the private disk but have no database row
 * (left behind only by a hard crash between the file write and the transaction).
 * Database rows are never changed; rows whose file is missing are only reported.
 */
class SweepEvidenceOrphans extends Command
{
    protected $signature = 'testpilot:evidence-sweep {--dry-run : List orphans without deleting} {--grace=24 : Minimum age in hours before an unreferenced file is removed}';

    protected $description = 'Delete unreferenced evidence files older than the grace period (never touches database rows)';

    public function handle(): int
    {
        $grace = (int) $this->option('grace');
        if ($grace < 1) {
            $this->error('The grace period must be at least 1 hour, so in-flight uploads are never removed.');

            return self::FAILURE;
        }
        $disk = Storage::disk('evidence');
        $cutoff = now()->subHours($grace)->getTimestamp();

        // List the disk first, then read the database: a file stored after the listing is not a candidate at all,
        // and a file stored before it already has its row committed or is younger than the grace period.
        $candidates = [];
        foreach ($disk->allFiles() as $path) {
            if (! preg_match('#^\d+/[0-9a-f]{40}\.[a-z0-9]{2,5}$#', $path)) {
                continue; // not a file this application wrote; leave it alone
            }
            if ($disk->lastModified($path) <= $cutoff) {
                $candidates[] = $path;
            }
        }
        $known = [];
        foreach (array_chunk($candidates, 500) as $chunk) {
            foreach (DB::table('evidence_files')->whereIn('path', $chunk)->pluck('path') as $path) {
                $known[$path] = true;
            }
        }
        $orphans = array_values(array_filter($candidates, fn (string $path) => ! isset($known[$path])));

        $bytes = 0;
        foreach ($orphans as $path) {
            $bytes += (int) $disk->size($path);
            if (! $this->option('dry-run')) {
                $disk->delete($path);
            }
        }
        $missing = 0;
        DB::table('evidence_files')->select('id', 'path')->orderBy('id')->chunkById(500, function ($rows) use ($disk, &$missing) {
            foreach ($rows as $row) {
                if (! $disk->exists($row->path)) {
                    $missing++;
                    $this->warn("Evidence #{$row->id} has no file on disk.");
                }
            }
        });

        $verb = $this->option('dry-run') ? 'would remove' : 'removed';
        $this->info(sprintf('Sweep %s %d orphan file(s) (%d bytes); %d database row(s) without a file.', $verb, count($orphans), $bytes, $missing));

        return self::SUCCESS;
    }
}
