import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class Issues extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Label',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoardRelationship',
    'tms_TaskTag',
    'tms_User',
    'vcs_PullRequestLabel',
  ];

  private readonly issueLabelsStream = new StreamName('github', 'issue_labels');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.issueLabelsStream];
  }

  private async convertIssue(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const issue = record.record.data;
    const res: DestinationRecord[] = [];
    const uid = `${issue.id}`;

    const user = GitHubCommon.tms_User(issue?.user, source);
    if (user) res.push(user);

    issue.assignees?.forEach((a) => {
      const assignee = GitHubCommon.tms_User(a, source);
      if (assignee) {
        res.push(assignee);
        res.push({
          model: 'tms_TaskAssignment',
          record: {
            task: {uid, source},
            assignee: {uid: assignee.record.uid, source},
          },
        });
      }
    });

    this.convertLabels(record, ctx, res);

    // Github issues only have state either open or closed
    const category = issue.state === 'open' ? 'Todo' : 'Done';
    res.push({
      model: 'tms_Task',
      record: {
        uid,
        name: issue.title,
        description: issue.body?.substring(
          0,
          GitHubCommon.MAX_DESCRIPTION_LENGTH
        ),
        status: {category, detail: issue.state},
        createdAt: Utils.toDate(issue.created_at),
        updatedAt: Utils.toDate(issue.updated_at),
        creator: user ? {uid: user.record.uid, source} : undefined,
        source,
      },
    });

    const repository = GitHubCommon.parseRepositoryKey(
      issue.repository,
      source
    );

    // TODO: If tasks get transferred between repos or projects, delete previous relationship
    // (this should probably be done in here and in issue-events)
    res.push({
      model: 'tms_TaskBoardRelationship',
      record: {
        task: {uid, source},
        board: repository ? {uid: repository.name, source} : null,
      },
    });

    return res;
  }

  private async convertPullRequest(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];

    this.convertLabels(record, ctx, res);

    return res;
  }

  private convertLabels(
    record: AirbyteRecord,
    ctx: StreamContext,
    result: DestinationRecord[]
  ): void {
    const issue = record.record.data;
    const uid = `${issue.id}`;
    const source = this.streamName.source;
    const issueLabelsStream = this.issueLabelsStream.asString;

    for (const labelNode of issue.labels) {
      const label = ctx.get(issueLabelsStream, String(labelNode.id));
      const name = label?.record?.data?.name;
      if (!name) continue;
      result.push({
        model: issue.pull_request ? 'vcs_PullRequestLabel' : 'tms_TaskTag',
        record: {pullRequest: {uid, source}, label: {name}},
      });
    }
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const issue = record.record.data;

    if (issue.pull_reuqest) {
      return this.convertPullRequest(record, ctx);
    } else {
      return this.convertIssue(record, ctx);
    }
  }
}
