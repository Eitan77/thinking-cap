/** Current clock facts are supplied explicitly; never infer calendar events. */
export function clockContext(timeZone:unknown,now=new Date()):string {
  const zone=typeof timeZone==='string'&&timeZone.length<=100?timeZone:'America/Los_Angeles';
  try {
    const local=new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeStyle:'long',timeZone:zone}).format(now);
    return `Local device clock (fresh at request time): ${local}. Timezone: ${zone}. Use this for today's date/current time questions. For a question about today's date or day, give both the weekday and full date; speech recognition can confuse "day" and "date". This does not establish any appointments or other current facts.`;
  }catch { throw new Error('Invalid device timezone.'); }
}
