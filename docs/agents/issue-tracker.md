# Issue tracker: GitHub

Issues and specs live in `awstephan/runngun.org` GitHub Issues.
Use the `gh` CLI from this repository.

## Operations

- Create: `gh issue create --title "..." --body-file <file>`
- Read: `gh issue view <number> --json number,title,body,labels,comments`
- List: `gh issue list --state open --json number,title,body,labels`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..." --remove-label "..."`
- Close: post an explanatory comment, then `gh issue close <number>`.

Before creating the first issue in a session, verify the target with
`gh repo view --json nameWithOwner`. It must be `awstephan/runngun.org`.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the GitHub issue.

## Relationships and dependencies

Use native GitHub sub-issues for parent-child relationships and native
issue dependencies for blockers. Check the installed CLI's help for
supported commands; use the GitHub API when necessary.

If native relationships are unavailable, put `Part of #<parent>` and
`Blocked by: #<number>, ...` at the top of the child issue body.
Also list children in the parent's task list.
A ticket is unblocked when every blocker is closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding

The map is one issue labelled `wayfinder:map`, with Notes,
Decisions-so-far, and Fog sections. Tickets are child issues labelled
`wayfinder:<type>`: research, prototype, grilling, or task.

Choose the first open child in map order with no open blockers and no
assignee. Claim it with `gh issue edit <number> --add-assignee @me`.
Resolve it by commenting with the answer, closing it, and appending
a summary and link to the map's Decisions-so-far section.
