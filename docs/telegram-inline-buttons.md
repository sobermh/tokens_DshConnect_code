# Telegram inline buttons

Telegram question options and Harness approval requests now include inline
buttons. Single-choice answers submit immediately. Multiple-choice answers can
be toggled before submitting. Free-text replies remain available, including for
questions without options. Questions with more than 95 options use text replies.

Approvals use the existing Harness approval queue, including bash requests that
Harness emits as `approval/requested`. Buttons only allow or reject the current
operation; they do not grant permanent authorization.

Callbacks use the existing `getUpdates` consumer. No webhook or second poller is
created. Each keyboard is bound to its message, chat, initiating user and pending
interaction, and the bot's access policy still applies. Completed button answers
remove the keyboard in place. Old buttons after a text answer, external resolution
or restart return an unavailable notice and cannot submit a new prompt.

Callback handles are random, process-local and bounded to 2048 keyboards. Restarting
does not restore old buttons. Submission failures preserve retry availability.

Verification: Telegram API payload tests, button authorization/replay tests,
multi-select and retry tests, approval queue integration, and a runtime test that
answers a pending Harness question through the same long poll using either text
or a callback. Local live Telegram testing confirmed single-choice and multiple-choice
answers reach Harness and the model continues to completion. Live approval-button
testing remains outstanding.

The host adapter supports both the current Session `snapshotEvents()` API and the
legacy `events` array when identifying IM-owned questions and approvals.
