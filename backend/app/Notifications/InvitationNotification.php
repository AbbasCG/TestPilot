<?php

namespace App\Notifications;

use Carbon\CarbonInterface;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Sent only when TESTPILOT_MAIL_ENABLED is true; never queued with the token in a log channel. */
class InvitationNotification extends Notification
{
    public function __construct(private string $url, private ?string $project, private string $inviter, private CarbonInterface $expiresAt) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('دعوة للانضمام إلى TestPilot')
            ->line($this->project ? "دعاك {$this->inviter} للانضمام إلى مشروع «{$this->project}» في TestPilot." : "دعاك {$this->inviter} لإنشاء حساب في TestPilot.")
            ->action('قبول الدعوة', $this->url)
            ->line('صلاحية الرابط حتى '.$this->expiresAt->toDayDateTimeString().' (UTC)، ويُستخدم مرة واحدة فقط.')
            ->line('إذا لم تكن تتوقع هذه الدعوة فتجاهل الرسالة.');
    }
}
