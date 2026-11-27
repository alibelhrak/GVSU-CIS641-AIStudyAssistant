/**
 * Calendar invitations for study group meetings (iCalendar, RFC 5545), read by Google Calendar,
 * Outlook and Apple Calendar.
 *  - method 'REQUEST': attached to the meeting email (Outlook and Gmail offer to add it, Outlook adds it by itself)
 *  - method 'CANCEL':  attached to the cancellation email (removes it from the calendar)
 *  - method 'PUBLISH': the "Download .ics" file in the app (a plain event to import)
 * The same UID is used every time, so a cancellation finds the event it cancels.
 */
import { config } from '../config.js';

const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');   // 20261201T180000Z
const text = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const host = () => { try { return new URL(config.appUrl).hostname; } catch { return 'studypilot'; } };

/** Lines longer than 75 bytes are folded (continued on the next line after a space), as the standard requires */
function fold(line) {
  const out = []; let cur = ''; let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export const meetingEnd = (m) => new Date(new Date(m.start).getTime() + m.duration * 60_000);

export function meetingDetails(m, groupName) {
  return [`StudyPilot study group: ${groupName}`, '', `Join: ${m.joinUrl}`, ...(m.passcode ? [`Passcode: ${m.passcode}`] : []), '', `Group: ${config.appUrl}/groups/${m.group}`].join('\n');
}

export function meetingIcs(m, groupName, { method = 'PUBLISH', attendee = null, organizerEmail = '' } = {}) {
  const cancel = method === 'CANCEL';
  const from = organizerEmail || config.mail.from || `noreply@${host()}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyPilot//Study groups//EN', 'CALSCALE:GREGORIAN', `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:meeting-${m._id}@${host()}`,
    `SEQUENCE:${cancel ? 1 : 0}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(m.start)}`,
    `DTEND:${stamp(meetingEnd(m))}`,
    `SUMMARY:${text(`${cancel ? 'Cancelled: ' : ''}${m.topic} (${groupName})`)}`,
    `DESCRIPTION:${text(meetingDetails(m, groupName))}`,
    `LOCATION:${text(m.joinUrl)}`,
    `URL:${m.joinUrl}`,
    `STATUS:${cancel ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    ...(method === 'PUBLISH' ? [] : [`ORGANIZER;CN=${text(config.mail.fromName || 'StudyPilot')}:mailto:${from}`]),
    ...(attendee ? [`ATTENDEE;CN=${text(attendee.name || attendee.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=${cancel ? 'DECLINED' : 'NEEDS-ACTION'};RSVP=FALSE:mailto:${attendee.email}`] : []),
    ...(cancel ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(m.topic)}`, 'TRIGGER:-PT10M', 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** "Add to calendar" links for the web calendars */
export function calendarLinks(m, groupName) {
  const title = `${m.topic} (${groupName})`;
  const details = meetingDetails(m, groupName);
  const start = new Date(m.start); const end = meetingEnd(m);
  const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${stamp(start)}/${stamp(end)}`, details, location: m.joinUrl })}`;
  const outlook = (base) => `${base}/calendar/0/deeplink/compose?${new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: title, startdt: start.toISOString(), enddt: end.toISOString(), body: details, location: m.joinUrl })}`;
  return { google, outlook: outlook('https://outlook.office.com'), outlookLive: outlook('https://outlook.live.com') };
}
