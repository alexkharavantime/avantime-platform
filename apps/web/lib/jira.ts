export type JiraCreateResult = { key: string; url: string } | null;

export function jiraConfigured() {
  return Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_PROJECT_KEY && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
}

export async function createJiraIssue(input: { title: string; description: string; category: string; priority: string }): Promise<JiraCreateResult> {
  if (!jiraConfigured()) return null;
  const baseUrl = process.env.JIRA_BASE_URL!.replace(/\/$/, '');
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { project: { key: process.env.JIRA_PROJECT_KEY }, summary: input.title, description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: `${input.description}\n\nКатегория: ${input.category}\nПриоритет: ${input.priority}` }] }] }, issuetype: { name: 'Task' } } }),
  });
  if (!response.ok) throw new Error(`Jira create failed: ${response.status}`);
  const data = (await response.json()) as { key: string };
  return { key: data.key, url: `${baseUrl}/browse/${data.key}` };
}
