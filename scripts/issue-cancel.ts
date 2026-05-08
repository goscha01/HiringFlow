import { issueBookingToken } from '../src/lib/scheduling/booking-links'
console.log(issueBookingToken({ sessionId: process.argv[2], configId: process.argv[3], purpose: 'cancel', daysFromNow: 1 }))
