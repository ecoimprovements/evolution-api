import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/upstream-review.yml', import.meta.url), 'utf8');
const script = workflow.split('          script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function simulate({ ahead = 0, open = [], closed = [], compareError = false } = {}) {
  const created = [];
  const lists = [];
  const github = {
    rest: {
      repos: { compareCommitsWithBasehead: async args => {
        assert.equal(args.basehead, 'ecoimprovements:main...evolution-foundation:main');
        if (compareError) throw new Error('comparison unavailable');
        return { data: { ahead_by: ahead, head_commit: { sha: 'new-head' } } };
      } },
      pulls: {
        list: () => {},
        create: async args => {
          created.push(args);
          return { data: { html_url: 'https://example.test/pr/1' } };
        },
      },
    },
    paginate: async (_method, args) => {
      lists.push(args);
      return args.state === 'open' ? open : closed;
    },
  };
  await new AsyncFunction('github', 'context', 'core', script)(
    github, { repo: { owner: 'ecoimprovements', repo: 'evolution-api' } }, { info: () => {} },
  );
  return { created, lists };
}

test('identical upstream, or fork-only changes, produce no PR', async () => {
  assert.deepEqual(await simulate(), { created: [], lists: [] });
});

test('new upstream commits open one draft PR from upstream into fork main', async () => {
  const { created } = await simulate({ ahead: 3 });
  assert.equal(created.length, 1);
  assert.equal(created[0].head, 'evolution-foundation:main');
  assert.equal(created[0].base, 'main');
  assert.equal(created[0].owner, 'ecoimprovements');
  assert.equal(created[0].draft, true);
  assert.equal(created[0].maintainer_can_modify, false);
  assert.match(created[0].body, /new-head/);
});

test('an open upstream PR prevents duplicate PRs', async () => {
  const { created, lists } = await simulate({ ahead: 2, open: [{ html_url: 'existing' }] });
  assert.equal(created.length, 0);
  assert.equal(lists.length, 1);
  assert.equal(lists[0].head, 'evolution-foundation:main');
});

test('a rejected exact upstream head is not reopened automatically', async () => {
  const { created } = await simulate({ ahead: 1, closed: [{ merged_at: null, head: { sha: 'new-head' } }] });
  assert.equal(created.length, 0);
});

test('a later upstream head can be proposed after a rejection', async () => {
  const { created } = await simulate({ ahead: 1, closed: [{ merged_at: null, head: { sha: 'old-head' } }] });
  assert.equal(created.length, 1);
});

test('comparison failures fail closed', async () => {
  await assert.rejects(simulate({ ahead: 1, compareError: true }), /comparison unavailable/);
});

test('sync workflow has no checkout, shell, branch mutation or deployment rights', () => {
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /github.repository == 'ecoimprovements\/evolution-api'/);
  assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /contents: write|packages: write|secrets\.|uses: actions\/checkout|\brun:|pull_request_target/);
  assert.doesNotMatch(script, /\.merge\(|\.updateRef\(|\.createRef\(|exec\(/);
});

test('all inherited publishers are manual-only and blocked on the fork', () => {
  for (const file of ['publish_docker_image.yml', 'publish_docker_image_homolog.yml', 'publish_docker_image_latest.yml']) {
    const publisher = readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8');
    assert.match(publisher, /on:\n  workflow_dispatch:/);
    assert.doesNotMatch(publisher, /^  (push|pull_request|schedule|workflow_run):/m);
    assert.match(publisher, /build_deploy:\n    if: github.repository == 'evolution-foundation\/evolution-api'/);
  }
});
