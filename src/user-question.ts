// A final executor message opening with this line is a question for the user, not a result to accept.
export const USER_QUESTION_MARK = '[需要用户答复]';
export const AWAITING_REPLY = '执行者等待你的答复';
export const asksUser = (summary: string) => summary.trimStart().startsWith(USER_QUESTION_MARK);
export const userQuestionRule = ` 只有缺少必须由用户本人给出的决定或授权而无法继续时，最终消息第一行单独写 ${USER_QUESTION_MARK}，随后写具体问题，可选答案各占一行并以“- ”开头，然后结束本次调用；用户答复会直接送回本 Session。方案内的常规判断不提问。`;
/** The answers listed last in a question. They are shortcuts; any typed reply is equally valid. */
export function questionOptions(text: string): string[] {
  if (!asksUser(text)) return [];
  const option = (line: string) => line.match(/^\s*[-*•]\s+(.+)$/)?.[1]?.trim();
  const lines = text.split('\n'), options: string[] = [];
  let index = lines.length - 1;
  while (index >= 0 && !option(lines[index]!)) index--;
  for (; index >= 0 && option(lines[index]!); index--) options.unshift(option(lines[index]!)!);
  return options.slice(0, 6);
}
