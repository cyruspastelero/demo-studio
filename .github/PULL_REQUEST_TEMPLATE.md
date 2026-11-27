## Why

<!-- The problem this solves. The diff shows what changed. -->

## Checked

- [ ] `bash tests/smoke.sh` passes
- [ ] `python3 -I tests/test_check.py` pass
- [ ] `npm run test:app` passes (if `app/` changed)
- [ ] New config fields are in `schemas/`, the template and the example
- [ ] `python3 -I scripts/check-release.py` passes (secrets, personal paths, emails)
- [ ] No product names or account ids in skills, scripts or docs (no scanner knows these; read the diff)
