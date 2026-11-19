# Reviewers

Each lens runs on a different model family. Different families disagree in useful ways; one family reviewing three times converges.

| Lens | Name | Family, in order of preference |
|---|---|---|
| Robustness & keyboard | astra | OpenAI Codex (`gpt-6-astra`), then any other Codex model |
| Craft & consistency | fable | Claude Fable (newest available), then Claude Opus |
| Cold read | wonderful | Muse (`muse-wonder-full-1.0`) |

## Resolve targets live

1. Call T3's `orchestrator_capabilities`.
2. For each lens, pick the first family member on the list above whose provider instance has `canRunChildTask: true`. If the list leaves a model out, search for it by name.
3. Record in `reviewers.json` the provider instance and model each reviewer actually ran on.

On the owner's machine the targets have been:

| Name | `providerInstanceId` | Model |
|---|---|---|
| astra | `codex` | `gpt-6-astra` |
| fable | `claudeAgent` | `claude-fable-5-1` |
| wonderful | `muse_muse_code_personal` | `muse-wonder-full-1.0` |

These are a starting point, not configuration. Instances and model ids change: always resolve live, and record what ran.

Set high effort:
- Claude: `{effort: "high"}`
- Codex and Muse: `{reasoningEffort: "high"}`

## Dispatch

Dispatch each reviewer with `delegate_task`:
- `mode: "async"`
- `role: "review"`
- the lens file as the task, with its `{{…}}` filled in
- `clientRequestId: "<repo>-<audit>-<round>-<name>"`

The round is `preflight`, `review`, `fix-<name>` or `verify`. Each round is a new task with its own id: a correction or a re-check never reuses an earlier task.

Keep each returned `taskId` in `<audit>/reviewers.json`, under its round.

## Rate limits

**T3 resumes a child that hits a rate limit on its own.** Before re-dispatching a round, call `task_status` on its `taskId`. Launch a replacement only if that task is terminal and failed. The replacement keeps the round name and adds `-retry1` to its `clientRequestId`.

## Without T3

This applies under another harness, or when no cross-provider instance is available.

- Dispatch the three lenses as native subagents on the strongest available model.
- In the report's Runs section, write that all three lenses ran on one model family.

The lenses and the information hiding still apply. What's lost is the disagreement between model families.
