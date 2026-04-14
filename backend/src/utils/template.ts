import { Contact, User } from '../types';

export function renderTemplate(
  template: string,
  contact: Contact,
  sender: User
): string {
  return template
    .replace(/\{\{contact_name\}\}/g, contact.contact_name || '')
    .replace(/\{\{company\}\}/g, contact.company || '')
    .replace(/\{\{email\}\}/g, contact.email || '')
    .replace(/\{\{country\}\}/g, contact.country || '')
    .replace(/\{\{sender_name\}\}/g, sender.name || '')
    .replace(/\{\{sender_email\}\}/g, sender.email || '');
}

export function injectTrackingPixel(html: string, trackingPixelId: string): string {
  const apiUrl = process.env.API_URL || 'http://localhost:3001';
  const pixel = `<img src="${apiUrl}/track/open/${trackingPixelId}" width="1" height="1" style="display:none" alt="" />`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  return html + pixel;
}
