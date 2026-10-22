# Reviewed upstream updates and manual releases

## Activation

Merge the setup PR only after inspecting all changes. The scheduled workflow runs from main, daily at 07:23 UTC,
and can also be run manually from Actions > Review upstream updates. Check the first run explicitly.

In Settings > Actions > General, enable Actions if necessary and allow GitHub Actions to create pull requests
(the setting is named "Allow GitHub Actions to create and approve pull requests"). Keep the default token
permissions read-only; only this workflow requests pull-requests: write. It never approves or merges PRs.
No personal access token, Docker Hub password, or VPS key is required.

Public fork schedules may need enabling. GitHub can disable schedules after 60 days without repository activity;
check Actions periodically and enable the workflow again if disabled. Do not assume a quiet schedule is healthy.

## What the automation does

The workflow compares ecoimprovements:main with evolution-foundation:main through the GitHub API.
It opens one draft cross-repository PR from upstream main when upstream has unmerged commits.
It makes no branch pushes, resets, rebases, force pushes, merges, builds, publications or deployments.
Local fork commits remain in main. Conflicts require a maintainer to resolve them manually.
An existing open PR is reused naturally as upstream main advances. A closed, unmerged PR for the exact same
upstream SHA is respected; reopen it manually or wait for a new upstream head.

This is a moving upstream branch, not an immutable release. The SHA in the opening description is historical;
inspect the current PR head before approving. Do not use squash/rebase merging for upstream sync PRs:
use a merge commit to preserve upstream ancestry and avoid repeatedly proposing already integrated commits.

The workflow has contents: read and pull-requests: write only. It uses a pinned github-script commit and
does not check out or execute upstream code. There are no production credentials in this process.
PR workflows created by GITHUB_TOKEN may await human workflow approval. Review the workflow changes first,
then select Approve workflows to run if shown. Missing, pending, skipped or failed checks are not a pass.
If no checks appear, investigate the Actions run and repository policy before merging.

## Enforce human review

The initial inspection on 22 October 2026 found main unprotected and no repository rulesets.
The connector does not expose administration writes to configure these settings, even when the linked user
has repository admin rights. A maintainer must configure a main branch rule/ruleset in GitHub Settings:

- Require a pull request before merging; require an independent approving review where the team has a reviewer.
- Dismiss stale approvals when new commits arrive and require approval of the most recent reviewable push.
- Require the lint/build and security checks that actually run successfully in this repository, and require
  the branch to be up to date. Select real check names after the first run; do not invent required names.
- Require resolved conversations; block force pushes and deletion. Apply rules to administrators and avoid bypasses.
- Leave auto-merge disabled. Keep merge commits enabled for upstream updates.

A sole maintainer still needs to inspect and manually merge; an author cannot independently approve their own PR.
Without enforced repository rules, the checklist is a process rather than a technical guarantee against manual bypass.

## Inherited workflow audit

| File | Original trigger | Destination |
| --- | --- | --- |
| publish_docker_image_latest.yml | push to main | evoapicloud/evolution-api:latest |
| publish_docker_image_homolog.yml | push to develop | evoapicloud/evolution-api:homolog |
| publish_docker_image.yml | version-like tags | evoapicloud/evolution-api semver tags |

All three used DOCKER_USERNAME/DOCKER_PASSWORD, push: true and packages: write. The semver workflow's
"GitHub Container Registry" login label was misleading: no registry override was supplied and its target was Docker Hub.
Secret existence and Docker Hub access were not inspected or assumed.

The setup changes all three to manual dispatch only and adds a job condition allowing only the upstream repository.
Consequently they cannot publish from ecoimprovements/evolution-api, including after a merge to main or a tag push.
Never remove these guards during an upstream merge. Review any new or changed workflow for publication/deployment.
The other inherited workflows perform lint/build and CodeQL/dependency review; they do not publish Docker images.
Build success is not proof of compatibility with a real WhatsApp session.

## Test and release to Eco Expert Suite

1. Review API changes, environment changes, Baileys/provider versions, dependency changes, submodule revisions and
   PostgreSQL/MySQL migrations. Test the proposed merge including fork-specific changes, not just upstream head.
   The inherited lint workflow uses Node 20 while Docker uses Node 24; validate using the intended runtime too.
   Set DATABASE_PROVIDER to the actual provider before Prisma generation. Keep staging credentials separate.
2. Build an image from the reviewed candidate commit and record the commit SHA and resulting image digest.
   For example, in a clean checkout of that exact candidate, initialize its reviewed submodules and run a manual
   Docker build with an explicit tag in a registry you control. Do not use the inherited evoapicloud publishing target.
   Publish only as a separate deliberate release step; test that exact digest before promoting it.
3. Start a separate staging stack with its own database, Redis, instance volumes, API key and webhook endpoint.
   Never reuse the live session store or database. Use a dedicated test WhatsApp account/number and authorized test recipients.
4. Check QR connection, reconnection after restart, outgoing/incoming text and media, delivery/read statuses,
   webhook authentication/retries/deduplication, instance isolation and Eco Expert Suite conversation/contact mapping.
   Verify the real API URL, API-key handling and webhook configuration used by the Suite. Simulated-server testing
   alone does not confirm any of these. No real-instance test was performed by this setup task.
5. Record staging results and migration/rollback plans, obtain human review, and manually merge the upstream PR.
   If merge resolution changes executable content, rebuild and retest the final commit. Neither the sync job nor
   the merge itself deploys anything through these workflows. Audit external host auto-deploy settings separately.
6. Before production, back up the database, Redis/session data, instance volumes and configuration; verify recovery.
   The Docker entrypoint invokes database deployment before startup, so starting a new image can run migrations.
   An old image alone may not roll back a migrated database: test restoration or backward compatibility first.
7. Manually change the live Evolution service image to the approved immutable digest and restart only that service
   through its existing deployment manager. Check connection, messages and webhook delivery in the Suite.
   Keep the prior digest and coordinated data restore available. Do not use Watchtower, moving :latest tags or
   automatic repository redeploys for this service. Upstream sync must not carry VPS deployment credentials.

## Hostinger: alongside existing applications

Use Manage on the existing VPS. Do not reinstall its OS or apply an OS/application template to a populated VPS:
that can destroy the current installation. First inspect the existing deployment manager, free RAM/disk and ports.
Read-only terminal checks (if Docker is already installed):

```sh
free -h
df -h
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
docker compose ls
ss -lnt
```

If Docker Manager, Dokploy, Coolify or another manager is already used, create a new project in that manager.
Do not install a second proxy on ports 80/443. Use a separate Compose project name, project-scoped networks and
volumes, a dedicated PostgreSQL database/Redis, and a subdomain such as whatsapp.YOUR-DOMAIN.
Use the existing reverse proxy for HTTPS. For a host proxy, bind the API only to an unused loopback port
(for example 127.0.0.1:18080:8080 after checking availability); for a container proxy, use its supported private network.
Do not publicly publish database/Redis ports. Keep API keys and database passwords in the host's secret configuration.

The upstream docker-compose.yaml is an example, not an approved deployment configuration: it references mutable
latest images, fixed container names and an external dokploy-network which may not exist on this VPS.
Copying it unchanged neither builds this fork nor guarantees isolation from existing apps.
Prepare a host-specific stack only after confirming the existing proxy/manager, database provider and available resources.
Pin Evolution and supporting service images to reviewed versions/digests. A VPS model or screenshot alone does not
confirm spare capacity or identify which applications are currently deployed.

## References

- https://docs.github.com/en/actions/concepts/security/github_token
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- https://www.hostinger.com/support/4965922-how-to-change-the-operating-system-of-your-vps-at-hostinger/
