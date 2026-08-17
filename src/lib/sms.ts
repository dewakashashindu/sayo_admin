
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain || !localPart) return email;

  const len = localPart.length;


  if (len <= 2) {
    return `${localPart[0]}*@${domain}`;
  }


  if (len <= 4) {
    const front = localPart[0];
    const back = localPart[len - 1];
    const stars = '*'.repeat(len - 2);
    return `${front}${stars}${back}@${domain}`;
  }

 
  const visibleFront = Math.min(6, Math.floor(len / 3)); 
  const visibleBack = 3;                               

  if (len <= visibleFront + visibleBack) {
    const front = localPart.slice(0, 2);
    const back = localPart.slice(-2);
    const stars = '*'.repeat(len - 4);
    return `${front}${stars}${back}@${domain}`;
  }

  const front = localPart.slice(0, visibleFront);
  const back = localPart.slice(-visibleBack);
  const stars = '*'.repeat(len - (visibleFront + visibleBack));

  return `${front}${stars}${back}@${domain}`;
}



function maskPhone(phone: string): string {
  const cleaned = phone.trim().replace(/\s+/g, '').replace(/^\+/, '');

  if (cleaned.length < 7) return cleaned;

  const prefix = cleaned.slice(0, 3); // මුල් අංක 3
  const suffix = cleaned.slice(-3);  // අග අංක 3
  const maskedMiddle = '*'.repeat(cleaned.length - 6);

  return `${prefix}${maskedMiddle}${suffix}`;
}


interface RegistrationSMSProps {
  name: string;
  email: string;
  phone: string;
}

export async function sendRegistrationSMS({ name, email, phone }: RegistrationSMSProps) {
  const apiToken = process.env.TEXTLK_API_TOKEN;
  const senderId = process.env.TEXTLK_SENDER_ID;

  if (!apiToken || !senderId) {
    console.error('[SMS Service] TEXTLK_API_TOKEN or TEXTLK_SENDER_ID is missing in .env.local');
    return { success: false, error: 'SMS configuration missing' };
  }

 
  const formattedPhone = phone.trim().replace(/\s+/g, '').replace(/^\+/, '');

  // 🔒 Masking Execution
  const maskedEmail = maskEmail(email);
  const maskedPhoneNum = maskPhone(formattedPhone);

  // SMS Message Content
  const smsMessage = `Welcome to Sayo, ${name}!\nYour account has been successfully created.\nRegistered Email: ${maskedEmail}\nPhone: ${maskedPhoneNum}`;

  try {
    const response = await fetch('https://app.text.lk/api/v3/sms/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        recipient: formattedPhone, 
        sender_id: senderId,
        message: smsMessage,      
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Text.lk SMS Error]', data);
      return { success: false, error: data.message || 'Failed to send SMS' };
    }

    return { success: true, data };
  } catch (error) {
    console.error('[Text.lk SMS Fetch Error]', error);
    return { success: false, error: 'Internal server error while sending SMS' };
  }
}