import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inferAuthorizedApplication,
  shouldReconcileAuthorizedFlow,
  shouldSuppressAuthorizedReconcile,
} from '../plugin-src/host/connectors/feishu-personal/authorization-state.js';

test('Host reconciles a stale authorizing phase after the user token becomes valid', () => {
  assert.equal(shouldReconcileAuthorizedFlow({
    userAuthorized: true,
    suppressAuthorizedReconcile: false,
    phase: 'authorizing',
  }), true);
  assert.equal(shouldReconcileAuthorizedFlow({
    userAuthorized: true,
    suppressAuthorizedReconcile: false,
    phase: 'creating',
  }), true);
  assert.equal(shouldReconcileAuthorizedFlow({
    userAuthorized: true,
    suppressAuthorizedReconcile: false,
    phase: 'connected',
  }), false);
});

test('Host preserves intentional reauthorization until the old token is logged out', () => {
  const applications = [{ applicationId: 'application-a' }, { applicationId: 'application-b' }];
  const selectedApplication = applications[0];

  assert.equal(shouldSuppressAuthorizedReconcile({
    force: true,
    createNew: false,
    applicationId: 'application-a',
    applications,
    selectedApplication,
  }), true);
  assert.equal(shouldSuppressAuthorizedReconcile({
    force: false,
    createNew: true,
    applications,
    selectedApplication,
  }), true);
  assert.equal(shouldSuppressAuthorizedReconcile({
    force: false,
    createNew: false,
    applicationId: 'application-b',
    applications,
    selectedApplication,
  }), true);
  assert.equal(shouldSuppressAuthorizedReconcile({
    force: false,
    createNew: false,
    applicationId: 'application-a',
    applications,
    selectedApplication,
  }), false);
});

test('Host matches a valid personal token back to its persisted Feishu application', () => {
  const applications = [{ applicationId: 'application-a' }, { applicationId: 'application-b' }];

  assert.equal(inferAuthorizedApplication({
    liveApplication: applications[1],
    flowApplication: applications[0],
    applications,
  }), applications[1]);
  assert.equal(inferAuthorizedApplication({
    liveApplication: null,
    flowApplication: applications[0],
    applications,
  }), applications[0]);
  assert.equal(inferAuthorizedApplication({
    liveApplication: null,
    flowApplication: null,
    applications: [applications[0]],
  }), applications[0]);
  assert.equal(inferAuthorizedApplication({
    liveApplication: null,
    flowApplication: null,
    applications,
  }), null);
});
