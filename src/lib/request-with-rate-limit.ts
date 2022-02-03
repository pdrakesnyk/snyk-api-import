import * as needle from 'needle';
import Bottleneck from 'bottleneck';
import { OutgoingHttpHeaders } from 'http2';

export async function requestWithRateLimitRetries(
    verb: needle.NeedleHttpVerbs,
    url: string,
    headers: OutgoingHttpHeaders,
    limiter?: Bottleneck,
  ): Promise<any> {
    let data;
    const maxRetries = 7;
    let attempt = 0;
    while (attempt < maxRetries) {
        limiter ? limiter : limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1000, });
      data = await limiter.schedule(() => needle(verb, url, { headers: headers }));
      if (data.statusCode === 200) {
          return data;
      }
      if (data.statusCode === 401) {
        console.error(`ERROR: ${data.body}. Please check the token and try again.`)
        break;
      }
      if (data.statusCode === 404) {
        break;
      }
      if (data.statusCode === 429) {
        const sleepTime = 600 * attempt; // 10 mins x attempt with a max of ~ 1hr
        console.error(
          `Received a rate limit error, sleeping for ${sleepTime} ms (attempt # ${attempt})`,
        );
        await new Promise((r) => setTimeout(r, sleepTime));
      }
      attempt += 1;
    }
    return data;
  }