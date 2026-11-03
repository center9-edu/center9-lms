# Judge0

`/luyen-tap` runs student code through Judge0. `apps/api` is the only client; browsers and `apps/web` never reach it directly.

## Local development: fake

```sh
pnpm judge0:fake
```

`fake-judge0.mjs` imitates the Judge0 endpoints that the API uses, so the flow works on a laptop without a VM.

**It has no sandbox.** It runs code directly with the local `python3`, which can read your files and use your network. Use it only on your own machine with your own code. Never deploy it or expose it to a network.

It also cannot verify isolation, resource limits or load, and the local Python version may differ from Judge0's 3.8.1.

## Before any public release: real Judge0

Not done yet: this checklist has not been run against a real instance. **Do not make `/luyen-tap` public until it passes.**

### Setup

1. Create a dedicated Linux VM (x86-64, Ubuntu 22.04 recommended by Judge0) holding no secrets or other data, with a snapshot to restore from.
2. Add `systemd.unified_cgroup_hierarchy=0` to `GRUB_CMDLINE_LINUX` in `/etc/default/grub`, run `sudo update-grub`, and reboot.
3. Install Judge0 CE v1.13.1 following its [release notes](https://github.com/judge0/judge0/blob/master/CHANGELOG.md). Check whether its compose file runs containers as `privileged`.
4. Apply [`judge0.conf.example`](judge0.conf.example).
5. Firewall: open port 2358 only to the host running `apps/api`, and block outbound traffic that is not needed.
6. Set `JUDGE0_URL`, `JUDGE0_AUTHN_TOKEN` and `JUDGE0_AUTHZ_TOKEN` for the API.

### Verify

Run these through `/luyen-tap`, or `POST /coding-practice/problems/:slug/runs`:

- [ ] All five reference solutions pass on Python 3.8.1, with Vietnamese input and output.
- [ ] `input()`, syntax errors, and `while True: pass` show correctly.
- [ ] `memory_limit` of 128 MB is enough for Python to start. Adjust `MEMORY_LIMIT_KB` in `apps/api/src/coding-practice/judge0.client.ts` if not.
- [ ] A trailing newline in the output does not fail a test (the fake ignores trailing whitespace; confirm that Judge0 matches).
- [ ] A fork bomb, a memory bomb, and a large output flood are all contained.
- [ ] Network access from submitted code fails.
- [ ] Requests without the token are rejected.
- [ ] After a run, the submission no longer exists in Judge0.
- [ ] No telemetry leaves the VM.
- [ ] 20-30 concurrent runs complete. Use the result to choose the VM size and `COUNT`.

If any of these fail, stop and revisit the decision in [`docs/architecture/README.md`](../../docs/architecture/README.md) before going public.
