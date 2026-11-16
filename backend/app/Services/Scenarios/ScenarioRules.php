<?php

namespace App\Services\Scenarios;

use Illuminate\Validation\Rule;

/**
 * Single source of truth for what a valid scenario looks like. Used by the
 * scenario editor request and by the bulk import, so both accept exactly the
 * same data.
 */
final class ScenarioRules
{
    public const STEP_TYPES = ['navigate', 'click', 'input', 'select', 'upload', 'verify', 'compare', 'switch_user', 'wait_for_tester', 'shared_checkpoint', 'capture_evidence', 'custom_action'];

    public const PRIORITIES = ['low', 'medium', 'high', 'critical'];

    public const STATUSES = ['draft', 'ready', 'archived'];

    public const TEST_TYPES = ['functional', 'regression', 'smoke', 'security', 'integration', 'usability', 'performance', 'other'];

    public const ROLES = ['A', 'B', 'both'];

    /**
     * @return array<string, mixed>
     */
    public static function rules(int $projectId, bool $update = false): array
    {
        $rules = [
            'suite_id' => ['required', 'integer', Rule::exists('test_suites', 'id')->where('project_id', $projectId)->where('archived', false)],
            'environment_id' => ['nullable', 'integer', Rule::exists('environments', 'id')->where('project_id', $projectId)->where('archived', false)],
            'title' => ['required', 'string', 'max:200'],
            'priority' => ['required', Rule::in(self::PRIORITIES)],
            'status' => ['required', Rule::in(self::STATUSES)],
            'test_type' => ['required', Rule::in(self::TEST_TYPES)],
            'is_template' => ['required', 'boolean'],
            'version' => [$update ? 'required' : 'sometimes', 'integer', 'min:1'],
            'dependencies' => ['present', 'array', 'max:50'],
            'dependencies.*' => ['integer', 'distinct', Rule::exists('test_cases', 'id')->where('project_id', $projectId)],
            'steps' => ['required', 'array', 'min:1', 'max:100'],
            'steps.*' => ['array:id,type,title,assigned_role,url,target,value,expected_result,instructions,checkpoint,evidence_required,depends_on'],
            'steps.*.id' => ['required', 'uuid', 'distinct'],
            'steps.*.type' => ['required', Rule::in(self::STEP_TYPES)],
            'steps.*.title' => ['required', 'string', 'max:200'],
            'steps.*.assigned_role' => ['required', Rule::in(self::ROLES)],
            'steps.*.url' => ['nullable', 'url:http,https', 'max:2048'],
            'steps.*.evidence_required' => ['required', 'boolean'],
            'steps.*.depends_on' => ['present', 'array', 'max:100'],
            // Uniqueness is checked per step in graphErrors(): a wildcard "distinct" would wrongly forbid two steps sharing a prerequisite.
            'steps.*.depends_on.*' => ['uuid'],
            'steps.*.expected_result' => ['required', 'string', 'max:5000'],
        ];
        foreach (['description', 'objective', 'prerequisites', 'required_account', 'required_role', 'test_data', 'expected_results', 'acceptance_criteria'] as $field) {
            $rules[$field] = [in_array($field, ['objective', 'acceptance_criteria']) ? 'required' : 'nullable', 'string', 'max:10000'];
        }
        foreach (['target', 'value', 'instructions', 'checkpoint'] as $field) {
            $rules["steps.*.$field"] = ['nullable', 'string', 'max:5000'];
        }

        return $rules;
    }

    /**
     * Step graph rules that cannot be expressed per field.
     *
     * @return array<string, string> error key => message
     */
    public static function graphErrors(mixed $steps): array
    {
        $errors = [];
        if (! is_array($steps)) {
            return $errors;
        }
        $seen = [];
        foreach ($steps as $index => $step) {
            if (! is_array($step)) {
                continue;
            }
            $dependencies = is_array($step['depends_on'] ?? null) ? $step['depends_on'] : [];
            if (count($dependencies) !== count(array_unique(array_map('strval', $dependencies)))) {
                $errors["steps.$index.depends_on"] = 'لا تكرر الاعتماد نفسه داخل الخطوة.';
            }
            foreach ($dependencies as $dependency) {
                if (! in_array($dependency, $seen, true)) {
                    $errors["steps.$index.depends_on"] = 'يجب أن تعتمد الخطوة على خطوة سابقة موجودة.';
                }
            }
            if (($step['type'] ?? '') === 'shared_checkpoint' && (($step['assigned_role'] ?? '') !== 'both' || empty($step['checkpoint']))) {
                $errors["steps.$index.checkpoint"] = 'نقطة التحقق المشتركة تحتاج معيار تحقق وتأكيد الطرفين.';
            }
            if (($step['type'] ?? '') === 'wait_for_tester' && empty($step['depends_on'])) {
                $errors["steps.$index.depends_on"] = 'حدّد الخطوة التي تنتظر اكتمالها.';
            }
            $seen[] = $step['id'] ?? null;
        }

        return $errors;
    }

    /**
     * Why a scenario cannot be executed by a single tester, or null when it can.
     *
     * @param  array<string, mixed>  $content
     */
    public static function soloIneligibility(array $content): ?string
    {
        foreach ($content['steps'] ?? [] as $step) {
            $role = $step['assigned_role'] ?? 'A';
            $type = $step['type'] ?? '';
            if ($role === 'B') {
                return 'يتضمن خطوات مخصصة للمختبر B.';
            }
            if ($role === 'both' || $type === 'shared_checkpoint') {
                return 'يتضمن نقطة تحقق مشتركة بين طرفين.';
            }
            if ($type === 'wait_for_tester') {
                return 'يتضمن خطوة انتظار لمختبر آخر.';
            }
        }

        return null;
    }
}
