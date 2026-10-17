# 5-minute demo
1. `docker compose up -d`, start API + worker + frontend (see README). Open http://localhost:5173 and click **Continue with Google**.
2. **Integrations**: *Connect Slack*, then *Send test*.
3. **New campaign**: upload `docs/sample-recipients.csv` (shows valid/skipped counts), set start = now, delay = 5 s, **hourly limit = 3**, then *Review & schedule* and confirm.
4. **Scheduled / Pending / Sent** pages update; use *Preview* links (Ethereal) to open delivered messages.
5. After 3 emails the limit is hit: the rest stay deferred and one Slack alert arrives. Open **Queue monitor** to show delayed jobs.
6. Stop the worker (Ctrl+C) mid-run and start it again: remaining emails continue, no duplicates.
7. **Search** for a recipient or subject (Elasticsearch).
