import { issueBookingToken } from '../src/lib/scheduling/booking-links'
const t = issueBookingToken({
  sessionId: process.argv[2],
  configId: process.argv[3],
  purpose: 'reschedule',
  daysFromNow: 1,
})
console.log(t)
