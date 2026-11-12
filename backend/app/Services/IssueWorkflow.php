<?php

namespace App\Services;

/**
 * Explicit issue state machine. Each manual transition names who may perform
 * it: "manager" (project owner/manager) or "assignee" (the current issue
 * assignee). The verified/reopened outcomes of a retest are system
 * transitions recorded by RetestService and are never offered manually from
 * ready_for_retest.
 */
final class IssueWorkflow
{
    public const STATUSES = ['new', 'triaged', 'assigned', 'in_progress', 'ready_for_retest', 'verified', 'closed', 'reopened', 'duplicate', 'deferred', 'wont_fix'];

    public const OPEN = ['new', 'triaged', 'assigned', 'in_progress', 'ready_for_retest', 'reopened'];

    public const SEVERITIES = ['blocker', 'critical', 'major', 'minor', 'trivial'];

    public const PRIORITIES = ['urgent', 'high', 'medium', 'low'];

    /** @var array<string, array<string, list<string>>> */
    private const TRANSITIONS = [
        'new' => ['triaged' => ['manager'], 'duplicate' => ['manager'], 'deferred' => ['manager'], 'wont_fix' => ['manager']],
        'triaged' => ['assigned' => ['manager'], 'duplicate' => ['manager'], 'deferred' => ['manager'], 'wont_fix' => ['manager']],
        'assigned' => ['assigned' => ['manager'], 'in_progress' => ['manager', 'assignee'], 'deferred' => ['manager'], 'wont_fix' => ['manager']],
        'in_progress' => ['ready_for_retest' => ['manager', 'assignee'], 'assigned' => ['manager']],
        'ready_for_retest' => ['in_progress' => ['manager']],
        'verified' => ['closed' => ['manager'], 'reopened' => ['manager']],
        'reopened' => ['assigned' => ['manager'], 'in_progress' => ['manager', 'assignee']],
        'deferred' => ['triaged' => ['manager'], 'wont_fix' => ['manager']],
        'duplicate' => ['reopened' => ['manager']],
        'wont_fix' => ['reopened' => ['manager'], 'closed' => ['manager']],
        'closed' => ['reopened' => ['manager']],
    ];

    /**
     * @return list<string>
     */
    public static function allowed(string $from, bool $isManager, bool $isAssignee): array
    {
        $targets = [];
        foreach (self::TRANSITIONS[$from] ?? [] as $to => $actors) {
            if (($isManager && in_array('manager', $actors, true)) || ($isAssignee && in_array('assignee', $actors, true))) {
                $targets[] = $to;
            }
        }

        return $targets;
    }

    public static function exists(string $from, string $to): bool
    {
        return isset(self::TRANSITIONS[$from][$to]);
    }
}
