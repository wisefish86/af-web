# Pilot E2E scenario

Run with dedicated test accounts. Do not reuse the real coach or Andrey client records.

1. Trainer links a test client and creates program version 1.
2. Program contains one main exercise with three working sets, RIR target, and warm-up enabled at 50–60% of working weight.
3. Trainer activates version 1; client sees it and starts a workout.
4. Confirm the workout contains snapshot names, prescription, warm-up settings, and one optional warm-up set numbered 0.
5. Save one working set, close the browser, sign in again, and resume the same `in_progress` workout.
6. Save remaining sets and complete the workout.
7. Confirm update/delete attempts on the completed session, exercises, sets, and cardio fail.
8. Trainer clones version 1, changes the prescription, and activates version 2.
9. Confirm the old workout still shows version-1 names and prescription while the new workout uses version 2.
10. Complete a qualifying workout at the top of the repetition range. In the next workout confirm a higher load is shown only as a recommendation; the client may keep or change it.
11. Verify all working sets remain in history and warm-up sets are excluded from progression calculations.

