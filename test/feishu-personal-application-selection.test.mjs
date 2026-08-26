import assert from 'node:assert/strict';
import test from 'node:test';

import { selectPersonalApplication } from '../plugin-src/host/connectors/feishu-personal/application-selection.js';

const applications = [
  { applicationId: 'app_bot', botCount: 1 },
  { applicationId: 'app_personal', botCount: 0 },
];

test('one available Feishu application is selected automatically', () => {
  assert.equal(selectPersonalApplication({
    applications: [applications[0]],
    selectedApplication: null,
  }), applications[0]);
});

test('multiple Feishu applications require an explicit personal authorization choice', () => {
  assert.throws(() => selectPersonalApplication({
    applications,
    selectedApplication: null,
  }), (error) => error?.code === 'application_selection_required');
  assert.equal(selectPersonalApplication({
    applications,
    selectedApplication: null,
    applicationId: 'app_bot',
  }), applications[0]);
});

test('the selected personal application remains the default and independent creation stays explicit', () => {
  assert.equal(selectPersonalApplication({
    applications,
    selectedApplication: applications[1],
  }), applications[1]);
  assert.equal(selectPersonalApplication({
    applications,
    selectedApplication: applications[1],
    createNew: true,
  }), undefined);
});
