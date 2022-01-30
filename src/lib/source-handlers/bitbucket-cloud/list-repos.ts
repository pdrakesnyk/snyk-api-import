import * as needle from 'needle';
import * as debugLib from 'debug';
import Bottleneck from 'bottleneck';
import base64 = require('base-64');
import { BitbucketCloudRepoData } from './types';
import { getBitbucketCloudUsername } from './get-bitbucket-cloud-username';
import { getBitbucketCloudPassword } from './get-bitbucket-cloud-password';

const debug = debugLib('snyk:bitbucket-cloud');

const limiter = new Bottleneck({
  reservoir: 1000, // initial value
  reservoirRefreshAmount: 1000,
  reservoirRefreshInterval: 3600 * 1000,
  maxConcurrent: 1,
  minTime: 1000,
});

limiter.on('failed', async (error, jobInfo) => {
  const id = jobInfo.options.id;
  debug(`Job ${id} failed: ${error}`);
  if (jobInfo.retryCount === 0) {
    // Here we only retry once
    debug(`Retrying job ${id} in 25ms!`);
    return 25;
  }
});

export const fetchAllBitbucketcloudRepos = async (
  workspace: string,
  username: string,
  password: string,
): Promise<BitbucketCloudRepoData[]> => {
  let lastPage = false;
  let reposList: BitbucketCloudRepoData[] = [];
  let pageCount = 1;
  let nextPage = '';
  while (!lastPage) {
    debug(`Fetching page ${pageCount} for ${workspace}\n`);
    try {
      const { repos, next } = await getRepos(
        workspace,
        username,
        password,
        nextPage,
      );

      reposList = reposList.concat(repos);
      next
        ? ((lastPage = false), (nextPage = next))
        : ((lastPage = true), (nextPage = ''));
      pageCount++;
    } catch (err) {
      throw new Error(JSON.stringify(err));
    }
  }
  return reposList;
};

const getRepos = async (
  workspace: string,
  username: string,
  password: string,
  nextPage: string,
): Promise<{ repos: BitbucketCloudRepoData[]; next: string; }> => {
  const repos: BitbucketCloudRepoData[] = [];
  let next = '';
  let rateLimit = true;
  while (rateLimit) {
    const { statusCode, body } = await limiter.schedule(() =>
      needle(
        'get',
        nextPage != ''
          ? nextPage
          : `https://bitbucket.org/api/2.0/repositories/${workspace}`,
        {
          headers: {
            Authorization: 'Basic ' + base64.encode(username + ':' + password),
          },
        },
      ),
    );
    if (statusCode != 200) {
      if (statusCode == 429) {
        debug(
          `Failed to fetch page: https://bitbucket.org/api/2.0/repositories/${workspace}\n, Response Status: ${body}\nToo many requests \nWaiting for 3 minutes before resuming`,
        );
        await sleepNow(180000);
        rateLimit = true;
      } else {
        throw new Error(
          `Failed to fetch page: https://bitbucket.org/api/2.0/repositories/${workspace}\n, Response Status: ${statusCode}\nResponse Status Text: ${body} `,
        );
      }
    }
    rateLimit = false;
    const values = body['values'];
    next = body['next'];
    for (const repo of values) {
      repos.push({
        owner: repo.workspace.slug ? repo.workspace.slug : repo.workspace.uuid,
        name: repo.slug,
        branch: repo.mainbranch.name ? repo.mainbranch.name : '',
      });
    }
  }
  return { repos, next };
};

const sleepNow = (delay: number): unknown =>
  new Promise((resolve) => setTimeout(resolve, delay));

export async function listBitbucketCloudRepos(
  workspace: string,
): Promise<BitbucketCloudRepoData[]> {
  const bitbucketCloudUsername = getBitbucketCloudUsername();
  const bitbucketCloudPassword = getBitbucketCloudPassword();
  debug(`Fetching all repos data for org: ${workspace}`);
  const repoList = await fetchAllBitbucketcloudRepos(
    workspace,
    bitbucketCloudUsername,
    bitbucketCloudPassword,
  );
  return repoList;
}
