/**
 * Ready-to-use industry templates.
 *
 * Each template is a starting AgentDefinition a tenant can clone and customize.
 * Creating an agent from a template is what enables the "live in under 2 minutes"
 * experience: pick a template, attach a number, go live.
 */
import type { AgentDefinition } from '../core/types.ts';

export interface IndustryTemplate {
  id: string;
  industry: string;
  name: string;
  description: string;
  definition: AgentDefinition;
}

/** Shared defaults so templates stay DRY and consistent. */
function base(overrides: {
  businessType: string;
  greeting: string;
  persona?: string;
  qualifyingQuestions: string[];
  services: string[];
  faqs: Array<[string, string]>;
  transfer?: boolean;
}): AgentDefinition {
  return {
    persona:
      overrides.persona ??
      `You are a friendly, professional AI receptionist for a ${overrides.businessType}. ` +
        `Be warm, concise, and helpful. Answer questions, qualify the caller, and book ` +
        `appointments when appropriate. If you don't know something, offer to take a message ` +
        `or transfer to a team member. Speak in the caller's language.`,
    greeting: overrides.greeting,
    qualifyingQuestions: overrides.qualifyingQuestions,
    knowledgeBase: overrides.faqs.map(([question, answer]) => ({ question, answer })),
    booking: {
      enabled: true,
      provider: 'in_memory',
      services: overrides.services,
      timezone: 'America/New_York',
      slotMinutes: 30,
    },
    routing: {
      transferEnabled: overrides.transfer ?? true,
      escalateWhen: 'The caller is upset, has an emergency, or explicitly asks for a human.',
      afterHoursBehavior: 'book',
    },
    languages: ['en', 'es'],
  };
}

export const TEMPLATES: IndustryTemplate[] = [
  {
    id: 'dental',
    industry: 'Healthcare',
    name: 'Dental Clinic',
    description: 'Books cleanings/checkups, answers insurance & hours questions.',
    definition: base({
      businessType: 'dental clinic',
      greeting: 'Thanks for calling! This is the front desk. How can I help you today?',
      qualifyingQuestions: [
        'Are you a new or existing patient?',
        'What do you need to be seen for?',
        'Do you have dental insurance?',
      ],
      services: ['Cleaning', 'Checkup', 'Emergency', 'Consultation'],
      faqs: [
        ['What are your hours?', 'We are open Monday to Friday, 8am to 5pm.'],
        ['Do you take insurance?', 'We accept most major dental insurance plans.'],
        ['Do you see emergencies?', 'Yes, we reserve same-day slots for dental emergencies.'],
      ],
    }),
  },
  {
    id: 'medical',
    industry: 'Healthcare',
    name: 'Medical / GP Practice',
    description: 'Triage-aware scheduling and FAQ for a general practice.',
    definition: base({
      businessType: 'medical practice',
      greeting: 'Hello, you have reached the practice. How can I assist you?',
      qualifyingQuestions: [
        'Is this a new or existing patient?',
        'What symptoms or reason for the visit?',
        'Is this urgent?',
      ],
      services: ['New patient visit', 'Follow-up', 'Annual physical', 'Telehealth'],
      faqs: [
        ['Do you take walk-ins?', 'We prefer appointments but keep a few same-day slots.'],
        ['Can I get a prescription refill?', 'I can take your details and pass it to the nurse.'],
      ],
    }),
  },
  {
    id: 'legal',
    industry: 'Professional Services',
    name: 'Law Firm',
    description: 'Intake and consultation booking for legal practices.',
    definition: base({
      businessType: 'law firm',
      greeting: 'Thank you for calling. How may I direct your inquiry today?',
      qualifyingQuestions: [
        'What type of legal matter is this regarding?',
        'Is there a deadline or court date involved?',
        'What is the best contact number for you?',
      ],
      services: ['Free consultation', 'Case review', 'Document signing'],
      faqs: [
        ['Do you offer free consultations?', 'Yes, we offer a free 15-minute initial consultation.'],
        ['What practice areas do you cover?', 'We handle family, personal injury, and business law.'],
      ],
    }),
  },
  {
    id: 'real_estate',
    industry: 'Real Estate',
    name: 'Real Estate Agency',
    description: 'Captures buyer/seller leads and books showings.',
    definition: base({
      businessType: 'real estate agency',
      greeting: 'Hi there! Are you looking to buy, sell, or rent today?',
      qualifyingQuestions: [
        'Are you buying, selling, or renting?',
        'What area or property are you interested in?',
        'What is your budget or timeline?',
      ],
      services: ['Property showing', 'Listing appointment', 'Valuation'],
      faqs: [
        ['Do you handle rentals?', 'Yes, we manage both sales and rentals.'],
        ['What areas do you cover?', 'We cover the greater metro area and surrounding suburbs.'],
      ],
    }),
  },
  {
    id: 'hvac',
    industry: 'Home Services',
    name: 'HVAC Company',
    description: 'Books service calls and captures urgent no-heat/no-AC leads.',
    definition: base({
      businessType: 'HVAC company',
      greeting: 'Thanks for calling! Is your heating or cooling giving you trouble?',
      qualifyingQuestions: [
        'Is this for heating, cooling, or maintenance?',
        'Is the system completely down?',
        'What is the service address?',
      ],
      services: ['Repair', 'Maintenance', 'Installation quote', 'Emergency'],
      faqs: [
        ['Do you offer emergency service?', 'Yes, we offer 24/7 emergency service for no-heat and no-cool calls.'],
        ['Do you give free quotes?', 'Yes, installation estimates are free.'],
      ],
    }),
  },
  {
    id: 'plumbing',
    industry: 'Home Services',
    name: 'Plumbing Company',
    description: 'Dispatches plumbers and prioritizes emergencies.',
    definition: base({
      businessType: 'plumbing company',
      greeting: 'Hi! Do you have a plumbing issue we can help with?',
      qualifyingQuestions: [
        'What is the plumbing problem?',
        'Is there active water leaking right now?',
        'What is the service address?',
      ],
      services: ['Leak repair', 'Drain cleaning', 'Water heater', 'Emergency'],
      faqs: [
        ['Are you available now?', 'We offer same-day and emergency dispatch.'],
        ['Do you charge for estimates?', 'Diagnostic fees may apply; repairs are quoted upfront.'],
      ],
    }),
  },
  {
    id: 'salon',
    industry: 'Beauty & Wellness',
    name: 'Salon & Spa',
    description: 'Books appointments across stylists and services.',
    definition: base({
      businessType: 'salon and spa',
      greeting: 'Hello! Thanks for calling. What service can I book you in for?',
      qualifyingQuestions: [
        'Which service are you interested in?',
        'Do you have a preferred stylist?',
        'What days work best for you?',
      ],
      services: ['Haircut', 'Color', 'Manicure', 'Massage', 'Facial'],
      faqs: [
        ['What are your prices?', 'Pricing varies by service and stylist; I can share ranges.'],
        ['Do you take walk-ins?', 'We recommend booking, but we accept walk-ins when available.'],
      ],
    }),
  },
  {
    id: 'auto_repair',
    industry: 'Automotive',
    name: 'Auto Repair Shop',
    description: 'Schedules diagnostics and service, captures vehicle info.',
    definition: base({
      businessType: 'auto repair shop',
      greeting: 'Thanks for calling the shop! What is going on with your vehicle?',
      qualifyingQuestions: [
        'What is the year, make, and model?',
        'What symptoms are you experiencing?',
        'When would you like to bring it in?',
      ],
      services: ['Diagnostic', 'Oil change', 'Brake service', 'Tire service'],
      faqs: [
        ['Do you offer loaner cars?', 'We offer shuttle service and can advise on loaners.'],
        ['How long does a diagnostic take?', 'Most diagnostics take about an hour.'],
      ],
    }),
  },
  {
    id: 'restaurant',
    industry: 'Hospitality',
    name: 'Restaurant',
    description: 'Takes reservations and answers menu/hours questions.',
    definition: base({
      businessType: 'restaurant',
      greeting: 'Thank you for calling! Would you like to make a reservation?',
      qualifyingQuestions: [
        'How many people in your party?',
        'What date and time?',
        'Any dietary requirements?',
      ],
      services: ['Reservation', 'Private event inquiry', 'Takeout'],
      faqs: [
        ['What are your hours?', 'We serve lunch and dinner, Tuesday through Sunday.'],
        ['Do you have vegan options?', 'Yes, we have a dedicated vegan menu.'],
      ],
      transfer: false,
    }),
  },
  {
    id: 'fitness',
    industry: 'Fitness',
    name: 'Gym / Fitness Studio',
    description: 'Books tours and trials, answers membership questions.',
    definition: base({
      businessType: 'fitness studio',
      greeting: 'Hey! Thanks for calling. Interested in a membership or a class?',
      qualifyingQuestions: [
        'Are you interested in membership or a specific class?',
        'What are your fitness goals?',
        'Would you like to book a free trial?',
      ],
      services: ['Tour', 'Free trial class', 'Personal training consult'],
      faqs: [
        ['What are your hours?', 'We are open 5am to 11pm daily.'],
        ['Do you offer trials?', 'Yes, your first class or day pass is free.'],
      ],
    }),
  },
  {
    id: 'veterinary',
    industry: 'Healthcare',
    name: 'Veterinary Clinic',
    description: 'Books pet appointments and triages urgent cases.',
    definition: base({
      businessType: 'veterinary clinic',
      greeting: 'Thanks for calling! How can we help you and your pet today?',
      qualifyingQuestions: [
        'What type of pet and what is their name?',
        'What is the reason for the visit?',
        'Is this an emergency?',
      ],
      services: ['Wellness exam', 'Vaccination', 'Sick visit', 'Emergency'],
      faqs: [
        ['Do you see emergencies?', 'Yes, please describe the situation so we can prioritize.'],
        ['Do you board pets?', 'We offer limited boarding; I can check availability.'],
      ],
    }),
  },
  {
    id: 'insurance',
    industry: 'Financial Services',
    name: 'Insurance Agency',
    description: 'Captures quote requests and routes by policy type.',
    definition: base({
      businessType: 'insurance agency',
      greeting: 'Hello! Are you looking for a quote or help with an existing policy?',
      qualifyingQuestions: [
        'What type of insurance are you interested in?',
        'Is this a new quote or an existing policy?',
        'What is the best number to reach you?',
      ],
      services: ['Auto quote', 'Home quote', 'Life quote', 'Policy review'],
      faqs: [
        ['What types do you offer?', 'We offer auto, home, life, and business insurance.'],
        ['Can I bundle policies?', 'Yes, bundling often reduces your total premium.'],
      ],
    }),
  },
  {
    id: 'cleaning',
    industry: 'Home Services',
    name: 'Home Cleaning Service',
    description: 'Quotes and books recurring or one-time cleanings.',
    definition: base({
      businessType: 'home cleaning service',
      greeting: 'Hi! Looking to schedule a cleaning? I can help with that.',
      qualifyingQuestions: [
        'Is this a one-time or recurring cleaning?',
        'How many bedrooms and bathrooms?',
        'What is the address and preferred date?',
      ],
      services: ['Standard clean', 'Deep clean', 'Move-out clean', 'Recurring'],
      faqs: [
        ['How much does it cost?', 'Pricing depends on home size; I can give you an estimate.'],
        ['Do you bring supplies?', 'Yes, our teams bring all equipment and supplies.'],
      ],
    }),
  },
  {
    id: 'roofing',
    industry: 'Home Services',
    name: 'Roofing Company',
    description: 'Books inspections and captures storm-damage leads.',
    definition: base({
      businessType: 'roofing company',
      greeting: 'Thanks for calling! Do you need a roof repair, replacement, or inspection?',
      qualifyingQuestions: [
        'Is this a repair, replacement, or inspection?',
        'Do you see any active leaks or storm damage?',
        'What is the property address?',
      ],
      services: ['Free inspection', 'Repair', 'Replacement quote'],
      faqs: [
        ['Do you do free inspections?', 'Yes, roof inspections and estimates are free.'],
        ['Do you work with insurance?', 'Yes, we assist with storm-damage insurance claims.'],
      ],
    }),
  },
  {
    id: 'electrician',
    industry: 'Home Services',
    name: 'Electrician',
    description: 'Schedules electrical work and flags safety emergencies.',
    definition: base({
      businessType: 'electrical contractor',
      greeting: 'Hi! What electrical work can we help you with today?',
      qualifyingQuestions: [
        'What is the electrical issue or project?',
        'Is there any sparking, burning smell, or safety risk?',
        'What is the service address?',
      ],
      services: ['Repair', 'Panel upgrade', 'Installation', 'Emergency'],
      faqs: [
        ['Are you licensed?', 'Yes, all our electricians are licensed and insured.'],
        ['Do you offer emergency service?', 'Yes, for safety hazards we dispatch urgently.'],
      ],
    }),
  },
  {
    id: 'landscaping',
    industry: 'Home Services',
    name: 'Landscaping / Lawn Care',
    description: 'Quotes recurring lawn care and project work.',
    definition: base({
      businessType: 'landscaping company',
      greeting: 'Thanks for calling! Are you interested in lawn care or a landscaping project?',
      qualifyingQuestions: [
        'Is this recurring maintenance or a one-time project?',
        'What is the approximate property size?',
        'What is the address and your preferred start date?',
      ],
      services: ['Lawn mowing', 'Landscape design', 'Cleanup', 'Irrigation'],
      faqs: [
        ['Do you offer recurring service?', 'Yes, we offer weekly and bi-weekly plans.'],
        ['Do you give free quotes?', 'Yes, project estimates are free.'],
      ],
    }),
  },
  {
    id: 'moving',
    industry: 'Home Services',
    name: 'Moving Company',
    description: 'Captures move details and books estimates.',
    definition: base({
      businessType: 'moving company',
      greeting: 'Hi! Planning a move? I can get you a quote.',
      qualifyingQuestions: [
        'What is the moving date?',
        'Where are you moving from and to?',
        'How large is the move (bedrooms)?',
      ],
      services: ['Local move', 'Long-distance move', 'Packing', 'Storage'],
      faqs: [
        ['How is pricing calculated?', 'By distance, volume, and services needed.'],
        ['Do you pack for me?', 'Yes, full and partial packing services are available.'],
      ],
    }),
  },
  {
    id: 'tutoring',
    industry: 'Education',
    name: 'Tutoring Center',
    description: 'Books assessments and matches students to tutors.',
    definition: base({
      businessType: 'tutoring center',
      greeting: 'Hello! Are you looking for tutoring for yourself or your child?',
      qualifyingQuestions: [
        'What subject and grade level?',
        'What are the main goals?',
        'What is your preferred schedule?',
      ],
      services: ['Assessment', 'Math tutoring', 'Test prep', 'Reading support'],
      faqs: [
        ['Is tutoring in-person or online?', 'We offer both in-person and online sessions.'],
        ['Do you offer a free assessment?', 'Yes, the initial assessment is complimentary.'],
      ],
    }),
  },
  {
    id: 'property_mgmt',
    industry: 'Real Estate',
    name: 'Property Management',
    description: 'Routes tenant maintenance and prospective renter inquiries.',
    definition: base({
      businessType: 'property management company',
      greeting: 'Thank you for calling. Are you a current tenant or a prospective renter?',
      qualifyingQuestions: [
        'Are you a current tenant or prospective renter?',
        'Which property or unit is this about?',
        'What do you need help with?',
      ],
      services: ['Maintenance request', 'Rental inquiry', 'Tour booking'],
      faqs: [
        ['How do I submit a maintenance request?', 'I can log it now with your unit and details.'],
        ['What is available for rent?', 'I can check current vacancies for you.'],
      ],
    }),
  },
  {
    id: 'chiropractic',
    industry: 'Healthcare',
    name: 'Chiropractic Clinic',
    description: 'Books adjustments and new-patient consultations.',
    definition: base({
      businessType: 'chiropractic clinic',
      greeting: 'Thanks for calling! Are you a new or returning patient?',
      qualifyingQuestions: [
        'New or existing patient?',
        'What area are you experiencing pain?',
        'When would you like to come in?',
      ],
      services: ['New patient consult', 'Adjustment', 'Massage therapy'],
      faqs: [
        ['Do you take insurance?', 'We accept many plans and offer self-pay rates.'],
        ['Do I need a referral?', 'No referral is needed to book with us.'],
      ],
    }),
  },
  {
    id: 'med_spa',
    industry: 'Beauty & Wellness',
    name: 'Medical Spa',
    description: 'Books aesthetic treatments and consultations.',
    definition: base({
      businessType: 'medical spa',
      greeting: 'Hello and thanks for calling! What treatment are you interested in?',
      qualifyingQuestions: [
        'Which treatment are you interested in?',
        'Is this your first visit with us?',
        'What is your ideal timeframe?',
      ],
      services: ['Consultation', 'Botox', 'Facial', 'Laser treatment'],
      faqs: [
        ['Do you offer free consultations?', 'Yes, we offer complimentary consultations.'],
        ['Are treatments done by professionals?', 'All treatments are performed by licensed providers.'],
      ],
    }),
  },
  {
    id: 'general',
    industry: 'General',
    name: 'General Small Business',
    description: 'A flexible starting point for any service business.',
    definition: base({
      businessType: 'small business',
      greeting: 'Thank you for calling! How can I help you today?',
      qualifyingQuestions: [
        'How can I help you today?',
        'What is the best way to reach you?',
      ],
      services: ['General inquiry', 'Appointment', 'Callback request'],
      faqs: [
        ['What are your hours?', 'Please let me know what you need and I can help or take a message.'],
      ],
    }),
  },
];

export function getTemplate(id: string): IndustryTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
