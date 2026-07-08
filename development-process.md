# Development Process

This file describes the development process for this project.

## Planning

Before implementing any significant feature or change, a plan is written and stored in the `plans/` directory. Each TODO item in `TODO.md` gets its own plan file.

### Workflow

1. For each TODO item, create a plan file in `plans/` with a descriptive kebab-case filename (e.g., `plans/bake-layer.md`).
2. The plan should include:
   - A summary of what needs to be built
   - The affected files
   - A step-by-step implementation approach
   - Any key design decisions or tradeoffs
3. After writing a plan, add a note at the end of the corresponding TODO item in `TODO.md` in the form: `[planned: plan-name.md]` where `plan-name.md` is the filename (not the path) of the plan.
4. Commit the plan file and the updated `TODO.md` together.

## Working on TODO Items

TODO items in `TODO.md` are worked through in the order they are listed.

### Rules

- New TODO items may be added at any time, with or without an associated plan.
- A TODO item must have an associated plan before it is implemented.
- Work through items in listed order, skipping any marked `PENDING`.
- After any implementation change, review `design-docs/` and update any documents that are no longer accurate.
- When a thought or potential TODO item surfaces during work on something else, add it to `PARKINGLOT.md` rather than interrupting the current task. Items in the parking lot are not prioritized or planned; move them to `TODO.md` when ready to act on them.

### Workflow

1. Take the first TODO item that is not marked `PENDING` (or if it is marked `PENDING`, check to see if related questions have been answered, if they have then take the item).
2. If the item lacks a plan, write one first (see [Planning](#planning) above).
3. If the item cannot be implemented without answers to open questions:
   a. Add a **Status** section at the end of the plan file describing what is blocked and why.
   b. Add the question(s) to `QUESTIONS.md`.
   c. Mark the TODO item as `PENDING` in `TODO.md`.
   d. If there are local changes beyond `QUESTIONS.md`, `TODO.md`, and the plan file, commit those other changes to a branch, note the branch name in the Status section of the plan file, then commit `QUESTIONS.md`, `TODO.md`, and the plan file.
   e. Move on to the next non-`PENDING` item.
4. Otherwise, implement the item according to its plan.
5. Verify the changes as described in the plan. If a step of the verification requires launching the browser, make a note in the plan that it was skipped.
6. Review `design-docs/` and update any documents that no longer reflect the implementation.
7. Update the TODO.md to mark the item as `COMPLETED`.
8. Update the plan file to indicate in the title (not the filename) that the item is completed.
9. Commit the changes, TODO.md, the plan file, and any updated design docs.
  
