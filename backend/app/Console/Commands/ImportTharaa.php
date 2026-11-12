<?php

namespace App\Console\Commands;

use App\Models\Environment;
use App\Models\Issue;
use App\Models\Project;
use App\Models\TestCase;
use App\Models\TestSuite;
use App\Models\User;
use App\Services\IssueService;
use App\Services\ProjectService;
use App\Services\ScenarioService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Prepares Tharaa as a TestPilot project from database/data/tharaa.php.
 * Additive and idempotent: existing suites, scenarios and known issues
 * (matched by name/title inside the project) are left untouched. It never
 * connects to Tharaa and never creates user accounts.
 */
class ImportTharaa extends Command
{
    protected $signature = 'testpilot:import-tharaa {owner : Email of an existing TestPilot account that will own the project} {--dry-run : Show what would be created without writing}';

    protected $description = 'Create or complete the Tharaa project with its six scenario suites and known issues';

    public function handle(ProjectService $projects, ScenarioService $scenarios, IssueService $issues): int
    {
        $owner = User::where('email', strtolower((string) $this->argument('owner')))->first();
        if (! $owner) {
            $this->error('The owner account does not exist. Create it first with testpilot:user; this command never creates accounts.');

            return self::FAILURE;
        }
        $data = require database_path('data/tharaa.php');
        $dry = (bool) $this->option('dry-run');
        $created = ['project' => 0, 'suites' => 0, 'scenarios' => 0, 'issues' => 0];

        $project = Project::where('owner_id', $owner->id)->where('name', $data['project']['name'])->first();
        if (! $project) {
            $created['project'] = 1;
            if ($dry) {
                $this->line('Would create project: '.$data['project']['name']);
                $this->dryRunSummary($data);

                return self::SUCCESS;
            }
            $project = $projects->create($owner, ['name' => $data['project']['name'], 'description' => $data['project']['description'], 'status' => 'active']);
        }

        DB::transaction(function () use ($project, $owner, $data, $dry, $scenarios, $issues, $projects, &$created) {
            $environment = Environment::where('project_id', $project->id)->where('name', $data['project']['environment']['name'])->first();
            if (! $environment && ! $dry) {
                $environment = new Environment($data['project']['environment']);
                $environment->project_id = $project->id;
                $environment->save();
            }
            $scenarioIds = [];
            foreach ($data['suites'] as $position => $suiteData) {
                $suite = TestSuite::where('project_id', $project->id)->where('name', $suiteData['name'])->first();
                if (! $suite) {
                    $created['suites']++;
                    if ($dry) {
                        $created['scenarios'] += count($suiteData['scenarios']);

                        continue;
                    }
                    $suite = new TestSuite(['name' => $suiteData['name'], 'description' => $suiteData['description'], 'position' => $position, 'archived' => false]);
                    $suite->project_id = $project->id;
                    $suite->version = 1;
                    $suite->save();
                }
                foreach ($suiteData['scenarios'] as $content) {
                    $existing = TestCase::where('project_id', $project->id)->where('title', $content['title'])->first();
                    if ($existing) {
                        $scenarioIds[$this->code($content['title'])] = $existing->id;

                        continue;
                    }
                    $created['scenarios']++;
                    if (! $dry) {
                        $scenarioIds[$this->code($content['title'])] = $scenarios->save($project, $owner, [...$content, 'suite_id' => $suite->id])->id;
                    }
                }
            }
            foreach ($data['known_issues'] as $known) {
                if (Issue::where('project_id', $project->id)->where('title', $known['title'])->exists()) {
                    continue;
                }
                $created['issues']++;
                if ($dry) {
                    continue;
                }
                $issue = $issues->create($project, $owner, [
                    ...collect($known)->only(['title', 'description', 'reproduction_steps', 'expected_result', 'actual_result', 'severity', 'priority', 'build_version'])->all(),
                    'environment_id' => $environment?->id,
                ]);
                $issues->comment($project, $issue->id, $owner, "مشكلة معروفة مستوردة من سجل تدقيق ثراء ({$known['key']}). مرتبطة بالسيناريو {$known['scenario']}"
                    .(isset($scenarioIds[$known['scenario']]) ? " (TC-{$scenarioIds[$known['scenario']]})" : '').'. لا تُغلق إلا بعد إصلاح منشور وإعادة اختبار ناجحة.');
                $issues->transition($project, $issue->id, $owner, ['to' => 'triaged', 'version' => $issue->version, 'note' => 'Known Issue — مؤكدة وغير محلولة.']);
            }
            if (! $dry) {
                $projects->audit($project, $owner, 'project.imported', ['source' => 'tharaa', ...$created]);
            }
        });

        $this->info(($dry ? 'Dry run — would create: ' : 'Created: ').json_encode($created).' in project #'.$project->id);

        return self::SUCCESS;
    }

    private function code(string $title): string
    {
        return trim(strtok($title, '—'));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function dryRunSummary(array $data): void
    {
        foreach ($data['suites'] as $suite) {
            $this->line(' • '.$suite['name'].': '.count($suite['scenarios']).' scenarios');
        }
        $this->line(' • known issues: '.count($data['known_issues']));
    }
}
