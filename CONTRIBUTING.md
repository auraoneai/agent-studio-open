# Contributing To Agent Studio Open

Agent Studio Open accepts contributions under the Developer Certificate of
Origin rather than a CLA. Every commit must include a `Signed-off-by:` trailer
matching the commit author.

Use:

```bash
git commit -s
```

For an existing local commit, use:

```bash
git commit --amend --signoff
```

The `DCO / dco` pull request check verifies sign-off trailers before code can
merge. By signing off, you certify the Developer Certificate of Origin 1.1 at
<https://developercertificate.org/>.

Before opening a PR:

- Run the relevant unit, CLI, desktop, VS Code, or website checks for the files
  you changed.
- Keep generated artifacts and local credentials out of commits.
- Route security-sensitive changes through the CODEOWNERS reviewers listed in
  `CODEOWNERS`.
