import _ from 'lodash';
import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {backlogAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('backlog', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/backlog/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__backlog__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      issues: 3,
      projects: 1,
      users: 2,
    };
    const expectedWrittenByModel = {
      tms_Project: 1,
      tms_Release: 1,
      tms_Sprint: 2,
      tms_Task: 3,
      tms_TaskAssignment: 1,
      tms_TaskBoard: 1,
      tms_TaskBoardProjectRelationship: 1,
      tms_TaskBoardRelationship: 3,
      tms_TaskProjectRelationship: 3,
      tms_User: 2,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: backlogAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
