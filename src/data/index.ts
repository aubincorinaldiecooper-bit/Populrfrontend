// ============================================================
// Populr — Shared Mock Data Source
// All product data lives here. Components import from this file.
// ============================================================

// ─── Creator Profile ───────────────────────────────────────
export interface CreatorProfile {
  name: string;
  handle: string;
  avatar: string;
  category: string;
  niche: string;
  primaryGoal: string;
  location: string;
  bio: string;
}

export const creator: CreatorProfile = {
  name: 'Maya Chen',
  handle: '@mayastyle',
  avatar: '/images/avatar-maya.jpg',
  category: 'Fashion & Beauty',
  niche: 'Style guides & outfit inspiration',
  primaryGoal: 'Build audience',
  location: 'Los Angeles, CA',
  bio: 'Helping you find your personal style, one outfit at a time.',
};

// ─── Contacts ──────────────────────────────────────────────
export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter';
export type Relationship = 'new' | 'engaged' | 'warm' | 'ready' | 'subscriber' | 'high-value' | 'at-risk';
// ─── Contact Notes ─────────────────────────────────────────
export interface ContactNote {
  id: string;
  text: string;
  author: string;
  authorAvatar: string;
  createdAt: string;
}

// ─── Timeline Event ────────────────────────────────────────
export interface TimelineEvent {
  id: string;
  type: 'action' | 'note' | 'campaign' | 'intent' | 'merge';
  title: string;
  description: string;
  time: string;
  author?: string;
  authorAvatar?: string;
  metadata?: Record<string, string>;
}

// ─── Collected Info ────────────────────────────────────────
export interface CollectedInfo {
  field: string;
  value: string;
  source: string;
  collectedAt: string;
}

// ─── Intent Evidence ───────────────────────────────────────
export interface IntentEvidence {
  label: string;
  signals: string[];
}

export type Intent = 'casual' | 'engagement' | 'product-interest' | 'pricing' | 'collaboration' | 'support' | 'booking' | 'subscription' | 'conversion' | 'human-review';
export type Stage = 'discovered' | 'engaged' | 'interested' | 'converted';

// Human-readable intent labels
export const intentLabels: Record<Intent, string> = {
  'casual': 'Casual engagement',
  'engagement': 'Active engagement',
  'product-interest': 'Product interest',
  'pricing': 'Pricing interest',
  'collaboration': 'Collaboration request',
  'support': 'Support request',
  'booking': 'Booking intent',
  'subscription': 'Subscription intent',
  'conversion': 'High conversion intent',
  'human-review': 'Needs human review',
};

export const suggestedActionByIntent: Record<string, string> = {
  'conversion': 'Send a personalized offer — they have shown strong purchase signals',
  'pricing': 'Share pricing page and offer a discovery call',
  'collaboration': 'Send collaboration guidelines and your rate card',
  'support': 'Follow up on their issue and provide resolution',
  'engagement': 'Invite to upcoming live stream or community event',
  'casual': 'Nurture with valuable content — not ready for direct offers',
  'product-interest': 'Send product details and social proof',
  'booking': 'Share calendar link with available time slots',
  'subscription': 'Highlight subscriber benefits and exclusive content',
  'human-review': 'Review conversation and respond personally',
};

export interface Contact {
  id: string;
  handle: string;
  name: string;
  avatar: string;
  platform: Platform;
  relationship: Relationship;
  intent: Intent;
  stage: Stage;
  location?: string;
  bio?: string;
  insights: string[];
  intentEvidence: IntentEvidence;
  recentActions: { action: string; time: string; type: 'click' | 'message' | 'like' | 'comment' }[];
  campaigns: { name: string; stage: string }[];
  unread: boolean;
  tags?: string[];
  assignedTo?: string;
  notes: ContactNote[];
  collectedInfo?: CollectedInfo[];
  suggestedAction?: string;
  timeline?: TimelineEvent[];
  connectedPlatforms?: Platform[];
}

export const contacts: Contact[] = [
  {
    id: '1', handle: '@alex.styles', name: 'Alex Styles', avatar: '/images/avatar-alex.jpg',
    platform: 'instagram', relationship: 'warm', intent: 'conversion', stage: 'interested',
    bio: 'Fashion enthusiast & style blogger',
    insights: ['Engaged with 5 posts', 'Clicked 2 links', 'Replied to campaign messages'],
    intentEvidence: { label: 'High conversion intent', signals: ['Asked about styling sessions twice', 'Clicked the style guide link', 'Returned to the conversation after viewing the campaign post', 'Replied to automated follow-up within 2 hours'] },
    recentActions: [
      { action: 'Clicked style guide link', time: '2h ago', type: 'click' },
      { action: 'Replied to campaign message', time: '2d ago', type: 'message' },
      { action: 'Liked "Summer Outfits" post', time: '3d ago', type: 'like' },
      { action: 'Commented on "Color Theory" post', time: '5d ago', type: 'comment' },
    ],
    campaigns: [{ name: 'Style Guide Launch', stage: 'Interested' }, { name: 'Coaching Promo', stage: 'Engaged' }],
    unread: true, tags: ['warm-fan', 'style-guide'], assignedTo: 'Maya Chen',
    connectedPlatforms: ['instagram'],
    suggestedAction: 'Send a personalized offer — they have shown strong purchase signals',
    notes: [
      { id: 'n1', text: 'Interested in premium package. Follow up Friday.', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg', createdAt: '2d ago' },
      { id: 'n2', text: 'Clicked coaching link too — might want bundle pricing', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg', createdAt: '4d ago' },
    ],
    collectedInfo: [
      { field: 'Style preference', value: 'Minimalist', source: 'Style Guide Launch', collectedAt: '5d ago' },
      { field: 'Email', value: 'alex@email.com', source: 'Style Guide Launch', collectedAt: '5d ago' },
    ],
    timeline: [
      { id: 't1', type: 'action', title: 'Clicked style guide link', description: 'Clicked the link in Style Guide Launch campaign', time: '2h ago' },
      { id: 't2', type: 'note', title: 'Note added', description: 'Clicked coaching link too — might want bundle pricing', time: '4d ago', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg' },
      { id: 't3', type: 'campaign', title: 'Joined Coaching Promo', description: 'Automatically added to Coaching Promo campaign', time: '5d ago' },
      { id: 't4', type: 'campaign', title: 'Joined Style Guide Launch', description: 'Added via comment trigger on Summer Style Guide post', time: '5d ago' },
      { id: 't5', type: 'intent', title: 'Intent updated', description: 'AI detected high conversion intent — pricing questions + link clicks', time: '6d ago' },
    ],
  },
  {
    id: '2', handle: '@jenny.fitness', name: 'Jenny Fit', avatar: '/images/avatar-jenny.jpg',
    platform: 'tiktok', relationship: 'engaged', intent: 'collaboration', stage: 'engaged',
    bio: 'Fitness coach & wellness advocate',
    insights: ['Loves workout content', 'Asked about collab rates'],
    intentEvidence: { label: 'Collaboration request', signals: ['Sent a direct collaboration proposal', 'Asked about partnership rates', 'Has engaged with 8+ fitness posts', 'Shares similar audience demographics'] },
    recentActions: [
      { action: 'Sent collaboration DM', time: '4h ago', type: 'message' },
      { action: 'Liked fitness video', time: '1d ago', type: 'like' },
    ],
    campaigns: [{ name: 'Coaching Promo', stage: 'Engaged' }],
    unread: true, tags: ['collaboration'],
    connectedPlatforms: ['tiktok'],
    suggestedAction: 'Send collaboration guidelines and your rate card',
    notes: [
      { id: 'n3', text: 'Micro-influencer with 45K followers. Good fit for fitness collab.', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg', createdAt: '1d ago' },
    ],
    collectedInfo: [
      { field: 'Follower count', value: '45K', source: 'Direct message', collectedAt: '4h ago' },
      { field: 'Niche', value: 'Fitness & wellness', source: 'Profile', collectedAt: '4h ago' },
    ],
    timeline: [
      { id: 't6', type: 'action', title: 'Sent collaboration DM', description: 'Reached out about a workout series partnership', time: '4h ago' },
      { id: 't7', type: 'note', title: 'Note added', description: 'Micro-influencer with 45K followers. Good fit for fitness collab.', time: '1d ago', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg' },
      { id: 't8', type: 'campaign', title: 'Joined Coaching Promo', description: 'Engaged with Morning Routine Vlog', time: '3d ago' },
    ],
  },
  {
    id: '3', handle: '@design.marc', name: 'Marc Design', avatar: '/images/avatar-marc.jpg',
    platform: 'twitter', relationship: 'ready', intent: 'pricing', stage: 'interested',
    bio: 'UI/UX Designer & creative consultant',
    insights: ['Asked about pricing twice', 'High conversion intent detected'],
    intentEvidence: { label: 'Pricing interest', signals: ['Asked about consultation price', 'Asked about package deals', 'Clicked the booking link', 'Viewed the pricing page for 3+ minutes'] },
    recentActions: [
      { action: 'Asked about consultation price', time: '6h ago', type: 'message' },
      { action: 'Clicked booking link', time: '1d ago', type: 'click' },
    ],
    campaigns: [{ name: 'Coaching Promo', stage: 'Interested' }],
    unread: true, tags: ['ready-to-convert', 'pricing'],
    connectedPlatforms: ['twitter'],
    suggestedAction: 'Share pricing page and offer a discovery call',
    notes: [],
    collectedInfo: [
      { field: 'Budget range', value: '$500-1000', source: 'Direct message', collectedAt: '6h ago' },
      { field: 'Service interest', value: '1:1 consultation', source: 'Conversation', collectedAt: '6h ago' },
    ],
    timeline: [
      { id: 't9', type: 'action', title: 'Asked about pricing', description: 'Inquired about consultation price and package deals', time: '6h ago' },
      { id: 't10', type: 'action', title: 'Clicked booking link', description: 'Clicked the booking link in Coaching Promo campaign', time: '1d ago' },
      { id: 't11', type: 'intent', title: 'Intent updated', description: 'AI detected pricing interest — multiple pricing questions', time: '2d ago' },
    ],
  },
  {
    id: '4', handle: '@lily.bakes', name: 'Lily Bakes', avatar: '/images/avatar-lily.jpg',
    platform: 'instagram', relationship: 'subscriber', intent: 'support', stage: 'engaged',
    bio: 'Home baker & dessert creator',
    insights: ['Long-time follower', 'Subscribed to newsletter'],
    intentEvidence: { label: 'Support request', signals: ['Reported a broken download link', 'Previously downloaded recipe guide successfully', 'Subscribed to newsletter', 'No offer-related intent detected'] },
    recentActions: [
      { action: 'Reported broken download link', time: '1d ago', type: 'message' },
      { action: 'Downloaded recipe guide', time: '1w ago', type: 'click' },
    ],
    campaigns: [{ name: 'Recipe Guide', stage: 'Converted' }],
    unread: false, tags: ['subscriber'],
    connectedPlatforms: ['instagram'],
    suggestedAction: 'Follow up on their issue and provide resolution',
    notes: [
      { id: 'n4', text: 'Sent replacement link. She confirmed it works.', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg', createdAt: '1d ago' },
    ],
    collectedInfo: [
      { field: 'Email', value: 'lily@bakes.com', source: 'Recipe Guide', collectedAt: '1w ago' },
      { field: 'Interest', value: 'Baking tutorials', source: 'Download form', collectedAt: '1w ago' },
    ],
    timeline: [
      { id: 't12', type: 'note', title: 'Note added', description: 'Sent replacement link. She confirmed it works.', time: '1d ago', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg' },
      { id: 't13', type: 'action', title: 'Reported broken link', description: 'Could not access the recipe guide download', time: '1d ago' },
      { id: 't14', type: 'campaign', title: 'Converted on Recipe Guide', description: 'Downloaded the recipe guide and subscribed', time: '1w ago' },
    ],
  },
  {
    id: '5', handle: '@tom.travels', name: 'Tom Travels', avatar: '/images/avatar-tom.jpg',
    platform: 'tiktok', relationship: 'engaged', intent: 'engagement', stage: 'engaged',
    bio: 'Travel vlogger & adventure seeker',
    insights: ['Asks about live streams', 'Engages with travel content'],
    intentEvidence: { label: 'Active engagement', signals: ['Asks about next live stream', 'Regularly likes and shares travel content', 'Engages with community posts', 'No purchase intent detected'] },
    recentActions: [
      { action: 'Asked about next live stream', time: '1d ago', type: 'message' },
      { action: 'Shared travel video', time: '3d ago', type: 'like' },
    ],
    campaigns: [{ name: 'Community Launch', stage: 'Engaged' }],
    unread: false, tags: ['engaged'],
    connectedPlatforms: ['tiktok'],
    suggestedAction: 'Invite to upcoming live stream or community event',
    notes: [],
    collectedInfo: [],
    timeline: [
      { id: 't15', type: 'action', title: 'Asked about live stream', description: 'Wants to know when the next travel live stream is scheduled', time: '1d ago' },
      { id: 't16', type: 'campaign', title: 'Joined Community Launch', description: 'Engaged with travel content series', time: '4d ago' },
    ],
  },
  {
    id: '6', handle: '@sarah.mua', name: 'Sarah MUA', avatar: '/images/avatar-sarah.jpg',
    platform: 'instagram', relationship: 'warm', intent: 'casual', stage: 'engaged',
    bio: 'Makeup artist & beauty educator',
    insights: ['Thanks for tips regularly', 'Warm community member'],
    intentEvidence: { label: 'Casual engagement', signals: ['Says thank you for makeup tips', 'Likes tutorial posts regularly', 'No link clicks or offer interest', 'Warm community member'] },
    recentActions: [
      { action: 'Said thank you for makeup tips', time: '2d ago', type: 'message' },
      { action: 'Liked tutorial post', time: '3d ago', type: 'like' },
    ],
    campaigns: [{ name: 'Beauty Course', stage: 'Engaged' }],
    unread: false, tags: ['warm-fan'],
    connectedPlatforms: ['instagram'],
    suggestedAction: 'Nurture with valuable content — not ready for direct offers',
    notes: [
      { id: 'n5', text: 'Warm community member. Could be nurtured toward beauty course.', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg', createdAt: '3d ago' },
    ],
    timeline: [
      { id: 't17', type: 'note', title: 'Note added', description: 'Warm community member. Could be nurtured toward beauty course.', time: '3d ago', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg' },
      { id: 't18', type: 'campaign', title: 'Joined Beauty Course', description: 'Engaged with makeup tutorial series', time: '5d ago' },
    ],
  },
  {
    id: '7', handle: '@kevin.tech', name: 'Kevin Tech', avatar: '/images/avatar-kevin.jpg',
    platform: 'youtube', relationship: 'new', intent: 'collaboration', stage: 'discovered',
    bio: 'Tech reviewer & gadget enthusiast',
    insights: ['New contact', 'Asked for product review'],
    intentEvidence: { label: 'Collaboration request', signals: ['New contact from YouTube', 'Asked to review a product', 'Subscribed to channel recently', 'Has tech-focused content'] },
    recentActions: [
      { action: 'Asked to review product', time: '3d ago', type: 'message' },
      { action: 'Subscribed to channel', time: '1w ago', type: 'like' },
    ],
    campaigns: [],
    unread: false, tags: ['new'],
    connectedPlatforms: ['youtube'],
    suggestedAction: 'Send collaboration guidelines and your rate card',
    notes: [],
    collectedInfo: [
      { field: 'Channel size', value: '12K subscribers', source: 'Profile', collectedAt: '3d ago' },
    ],
    timeline: [
      { id: 't19', type: 'action', title: 'Asked to review product', description: 'Reached out asking to review a new gadget', time: '3d ago' },
      { id: 't20', type: 'intent', title: 'Intent detected', description: 'AI flagged collaboration intent from new contact', time: '3d ago' },
    ],
  },
  {
    id: '8', handle: '@emma.yoga', name: 'Emma Yoga', avatar: '/images/avatar-emma.jpg',
    platform: 'instagram', relationship: 'ready', intent: 'conversion', stage: 'interested',
    bio: 'Yoga instructor & mindfulness coach',
    insights: ['High conversion intent', 'Interested in coaching program'],
    intentEvidence: { label: 'High conversion intent', signals: ['Expressed interest in coaching program', 'Clicked the coaching link', 'Asked about program details', 'Visited pricing page twice'] },
    recentActions: [
      { action: 'Expressed interest in coaching', time: '3d ago', type: 'message' },
      { action: 'Clicked coaching link', time: '4d ago', type: 'click' },
    ],
    campaigns: [{ name: 'Coaching Promo', stage: 'Interested' }],
    unread: false, tags: ['ready-to-convert'],
    connectedPlatforms: ['instagram'],
    suggestedAction: 'Send a personalized offer — they have shown strong purchase signals',
    notes: [
      { id: 'n6', text: 'Very interested in 3-month coaching program. Send detailed brochure.', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg', createdAt: '3d ago' },
    ],
    collectedInfo: [
      { field: 'Program interest', value: '3-month coaching', source: 'Direct message', collectedAt: '3d ago' },
      { field: 'Experience level', value: 'Intermediate', source: 'Conversation', collectedAt: '3d ago' },
    ],
    timeline: [
      { id: 't21', type: 'note', title: 'Note added', description: 'Very interested in 3-month coaching program. Send detailed brochure.', time: '3d ago', author: 'Maya Chen', authorAvatar: '/images/avatar-maya.jpg' },
      { id: 't22', type: 'action', title: 'Expressed coaching interest', description: 'Asked about the coaching program and clicked the link', time: '3d ago' },
      { id: 't23', type: 'campaign', title: 'Joined Coaching Promo', description: 'Added via DM trigger — coaching inquiry', time: '4d ago' },
      { id: 't24', type: 'intent', title: 'Intent updated', description: 'AI detected high conversion intent — program interest + link clicks', time: '5d ago' },
    ],
  },
];

// ─── Conversations ─────────────────────────────────────────
export interface Message {
  id: string;
  from: 'contact' | 'auto' | 'creator';
  text: string;
  time: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  messages: Message[];
  lastMessage: string;
  time: string;
  unread: boolean;
  intent: string;
  relationship: string;
  needsAttention: boolean;
  isAutomated?: boolean;
}

export const conversations: Conversation[] = [
  {
    id: '1', contactId: '1',
    messages: [
      { id: '1', from: 'auto', text: "Hey! Thanks for your interest in the Summer Style Guide. Here's the link: populr.club/guide", time: '3 days ago' },
      { id: '2', from: 'contact', text: 'Thanks! Just downloaded it', time: '3 days ago' },
      { id: '3', from: 'contact', text: 'The color palette section is exactly what I needed', time: '2 days ago' },
      { id: '4', from: 'auto', text: 'So glad you found it helpful! Want to join the Style Community?', time: '2 days ago' },
      { id: '5', from: 'contact', text: "Is the style guide still available? I've been sharing it with friends", time: '2h ago' },
      { id: '6', from: 'contact', text: 'Also wondering if you offer personal styling sessions?', time: '2h ago' },
    ],
    lastMessage: 'Also wondering if you offer personal styling sessions?',
    time: '2h ago', unread: true, intent: 'Strong offer intent', relationship: 'Warm fan', needsAttention: true, isAutomated: true,
  },
  {
    id: '2', contactId: '2',
    messages: [
      { id: '1', from: 'contact', text: 'Love your content! Want to collab on a workout series?', time: '4h ago' },
      { id: '2', from: 'contact', text: 'What are your rates for partnerships?', time: '4h ago' },
    ],
    lastMessage: 'What are your rates for partnerships?',
    time: '4h ago', unread: true, intent: 'Collaboration request', relationship: 'Engaged', needsAttention: true,
  },
  {
    id: '3', contactId: '3',
    messages: [
      { id: '1', from: 'contact', text: 'How much for the 1:1 consultation?', time: '6h ago' },
      { id: '2', from: 'contact', text: 'Also do you offer package deals?', time: '6h ago' },
    ],
    lastMessage: 'Also do you offer package deals?',
    time: '6h ago', unread: true, intent: 'Pricing question', relationship: 'Ready to convert', needsAttention: true,
  },
  {
    id: '4', contactId: '4',
    messages: [
      { id: '1', from: 'contact', text: "Hey! The download link for the recipe guide isn't working", time: '1d ago' },
      { id: '2', from: 'auto', text: 'Sorry about that! Let me send you a fresh link.', time: '1d ago' },
      { id: '3', from: 'contact', text: 'Got it, thanks so much!', time: '1d ago' },
    ],
    lastMessage: 'Got it, thanks so much!',
    time: '1d ago', unread: false, intent: 'Support request', relationship: 'Subscriber', needsAttention: false, isAutomated: true,
  },
  {
    id: '5', contactId: '5',
    messages: [
      { id: '1', from: 'contact', text: 'When is the next live stream? Love your travel content!', time: '1d ago' },
    ],
    lastMessage: 'When is the next live stream? Love your travel content!',
    time: '1d ago', unread: false, intent: 'Event interest', relationship: 'Engaged', needsAttention: false,
  },
  {
    id: '6', contactId: '6',
    messages: [
      { id: '1', from: 'contact', text: 'Thank you for the makeup tips! They helped so much', time: '2d ago' },
    ],
    lastMessage: 'Thank you for the makeup tips! They helped so much',
    time: '2d ago', unread: false, intent: 'Casual conversation', relationship: 'Warm fan', needsAttention: false,
  },
  {
    id: '7', contactId: '7',
    messages: [
      { id: '1', from: 'contact', text: 'Hey! Can you review this new gadget I launched?', time: '3d ago' },
    ],
    lastMessage: 'Hey! Can you review this new gadget I launched?',
    time: '3d ago', unread: false, intent: 'Collaboration request', relationship: 'Discovered', needsAttention: false,
  },
  {
    id: '8', contactId: '8',
    messages: [
      { id: '1', from: 'contact', text: 'Im interested in your coaching program. How does it work?', time: '3d ago' },
      { id: '2', from: 'auto', text: 'Id love to tell you more! Here is the info: populr.club/coaching', time: '3d ago' },
      { id: '3', from: 'contact', text: 'Thank you! Looking into it now', time: '3d ago' },
    ],
    lastMessage: 'Thank you! Looking into it now',
    time: '3d ago', unread: false, intent: 'High conversion intent', relationship: 'Interested', needsAttention: false, isAutomated: true,
  },
];

// ─── Social Posts / Content ────────────────────────────────
export interface ContentAttribution {
  contactsGenerated: number;
  conversationsStarted: number;
  interestedGenerated: number;
  highIntentGenerated: number;
  destinationClicks: number;
  campaignConversions: number;
  conversionRate: string;
}

export interface ContentItem {
  id: string;
  title: string;
  platform: Platform;
  thumbnail: string;
  caption: string;
  views: string;
  likes: string;
  comments: string;
  shares: string;
  engagementRate: string;
  contacts: number;
  conversations: number;
  warmFans: number;
  campaignConversions: number;
  attachedCampaign?: string;
  attachedAutomation?: string;
  date: string;
  format?: string;
  // Rich CRM attribution
  attribution: ContentAttribution;
  // IDs of contacts who engaged with this content
  engagedContactIds?: string[];
}

export const contentItems: ContentItem[] = [
  {
    id: '1', title: 'Summer Style Guide', platform: 'instagram',
    thumbnail: '/images/content-1.jpg',
    caption: '10 summer outfit ideas that will transform your wardrobe. Save this for later! Which look is your favorite? Drop a comment and I will send you the full style guide.',
    views: '12.4K', likes: '1.2K', comments: '89', shares: '34', engagementRate: '4.2%',
    contacts: 24, conversations: 8, warmFans: 3, campaignConversions: 3,
    attachedCampaign: 'Style Guide Launch', attachedAutomation: 'Comment to DM', date: '2d ago', format: 'Carousel',
    attribution: {
      contactsGenerated: 24,
      conversationsStarted: 8,
      interestedGenerated: 8,
      highIntentGenerated: 3,
      destinationClicks: 12,
      campaignConversions: 3,
      conversionRate: '12.5%',
    },
    engagedContactIds: ['1', '6'],
  },
  {
    id: '2', title: 'Morning Routine Vlog', platform: 'tiktok',
    thumbnail: '/images/content-2.jpg',
    caption: 'My 5AM morning routine that changed everything. From skincare to journaling to workout — this is how I start every day. Link in bio for the full guide.',
    views: '8.2K', likes: '942', comments: '56', shares: '21', engagementRate: '3.8%',
    contacts: 18, conversations: 5, warmFans: 2, campaignConversions: 2,
    attachedCampaign: 'Coaching Promo', date: '3d ago', format: 'Video',
    attribution: {
      contactsGenerated: 18,
      conversationsStarted: 5,
      interestedGenerated: 5,
      highIntentGenerated: 2,
      destinationClicks: 7,
      campaignConversions: 2,
      conversionRate: '11.1%',
    },
    engagedContactIds: ['2', '5'],
  },
  {
    id: '3', title: 'Productivity Tips for Creators', platform: 'youtube',
    thumbnail: '/images/content-3.jpg',
    caption: 'The productivity system I use to manage 3 platforms, a newsletter, and a coaching business. These 7 tips will save you 10+ hours per week.',
    views: '5.1K', likes: '456', comments: '34', shares: '12', engagementRate: '2.9%',
    contacts: 12, conversations: 3, warmFans: 1, campaignConversions: 0,
    date: '5d ago', format: 'Long-form',
    attribution: {
      contactsGenerated: 12,
      conversationsStarted: 3,
      interestedGenerated: 3,
      highIntentGenerated: 1,
      destinationClicks: 2,
      campaignConversions: 0,
      conversionRate: '0%',
    },
    engagedContactIds: ['7'],
  },
];

// ─── Campaigns ─────────────────────────────────────────────
export interface Campaign {
  id: string;
  name: string;
  goal: string;
  trigger: string;
  triggerRule?: string;
  message?: string;
  destination?: string;
  followUpRule?: string;
  status: 'active' | 'paused' | 'draft' | 'completed';
  discovered: number;
  engaged: number;
  interested: number;
  converted: number;
  clicks: number;
  conversions: number;
  rate: string;
  platform: string;
  attachedContent?: string;
  automationStatus: 'active' | 'paused' | 'none';
  humanHandoffs: number;
}

export const campaigns: Campaign[] = [
  {
    id: '1', name: 'Style Guide Launch', goal: 'Grow newsletter',
    trigger: 'Summer Style Guide post', triggerRule: 'When someone comments "STYLE" on Summer Style Guide, Populr will send this message.',
    message: "Hey! Thanks for your interest in the Summer Style Guide. Here's the link: populr.club/guide",
    destination: 'populr.club/guide',
    followUpRule: 'Send reminder after 24h if no click',
    status: 'active', platform: 'instagram', attachedContent: 'Summer Style Guide',
    discovered: 48, engaged: 24, interested: 12, converted: 6,
    clicks: 12, conversions: 6, rate: '50%',
    automationStatus: 'active', humanHandoffs: 3,
  },
  {
    id: '2', name: 'Coaching Call Promo', goal: 'Book clients',
    trigger: 'Morning Routine Vlog', triggerRule: 'When someone comments "COACH" on Morning Routine Vlog, Populr will send this message.',
    message: "Want 1:1 coaching? Book a free discovery call here: populr.club/book",
    destination: 'populr.club/book',
    followUpRule: 'Send testimonial after 48h if no click',
    status: 'active', platform: 'tiktok', attachedContent: 'Morning Routine Vlog',
    discovered: 32, engaged: 18, interested: 8, converted: 3,
    clicks: 8, conversions: 3, rate: '38%',
    automationStatus: 'active', humanHandoffs: 1,
  },
];

// ─── Automations ───────────────────────────────────────────
export interface Automation {
  id: string;
  name: string;
  trigger: string;
  action: string;
  status: 'active' | 'paused' | 'draft' | 'template';
  connectedCampaign?: string;
  contactsReached: number;
  messagesSent: number;
  replies: number;
  clicks: number;
  conversions: number;
  humanHandoffs: number;
  lastEdited: string;
  stopAfterConversion: boolean;
  humanReview: boolean;
}

export const automations: Automation[] = [
  { id: '1', name: 'Comment to DM', trigger: 'Keyword "guide" in comments', action: 'Send style guide link', status: 'active', connectedCampaign: 'Style Guide Launch', contactsReached: 24, messagesSent: 24, replies: 12, clicks: 8, conversions: 6, humanHandoffs: 2, lastEdited: '2d ago', stopAfterConversion: true, humanReview: false },
  { id: '2', name: 'Follow-up: No click', trigger: '24h after message, no click', action: 'Send reminder with social proof', status: 'active', connectedCampaign: 'Style Guide Launch', contactsReached: 12, messagesSent: 12, replies: 5, clicks: 4, conversions: 3, humanHandoffs: 1, lastEdited: '3d ago', stopAfterConversion: true, humanReview: false },
  { id: '3', name: 'High intent alert', trigger: 'Intent score > 80', action: 'Notify creator + pause automation', status: 'active', contactsReached: 8, messagesSent: 0, replies: 0, clicks: 0, conversions: 0, humanHandoffs: 8, lastEdited: '1w ago', stopAfterConversion: false, humanReview: true },
  { id: '4', name: 'Welcome new contacts', trigger: 'First engagement', action: 'Send welcome message', status: 'paused', contactsReached: 45, messagesSent: 45, replies: 18, clicks: 9, conversions: 9, humanHandoffs: 0, lastEdited: '2w ago', stopAfterConversion: false, humanReview: false },
];

// ─── Broadcasts ────────────────────────────────────────────
export interface Broadcast {
  id: string;
  name: string;
  segment: string;
  segmentSize: number;
  channel: string;
  platform: string;
  message: string;
  media?: string;
  destination?: string;
  status: 'sent' | 'scheduled' | 'draft';
  sentAt?: string;
  scheduledFor?: string;
  recipients: number;
  openRate: string;
  clickRate: string;
  replyCount: number;
}

export const broadcasts: Broadcast[] = [
  { id: '1', name: 'New style guide drop', segment: 'Warm fans', segmentSize: 34, channel: 'Instagram DM', platform: 'instagram', message: 'The new guide is here!', destination: 'populr.club/guide', status: 'sent', sentAt: '2d ago', recipients: 34, openRate: '68%', clickRate: '35%', replyCount: 12 },
  { id: '2', name: 'Coaching spots open', segment: 'Ready to convert', segmentSize: 17, channel: 'TikTok DM', platform: 'tiktok', message: '3 coaching spots just opened up', destination: 'populr.club/book', status: 'scheduled', scheduledFor: 'Tomorrow 10am', recipients: 17, openRate: '-', clickRate: '-', replyCount: 0 },
  { id: '3', name: 'Community invite', segment: 'Engaged contacts', segmentSize: 48, channel: 'Instagram DM', platform: 'instagram', message: 'Join our private style community', status: 'draft', recipients: 48, openRate: '-', clickRate: '-', replyCount: 0 },
];

// ─── Segments ──────────────────────────────────────────────
export interface Segment {
  id: string;
  name: string;
  count: number;
  description: string;
  filter: (c: Contact) => boolean;
}

// ─── AI-Generated Segments ────────────────────────────────
export interface AISegment {
  id: string;
  name: string;
  count: number;
  description: string;
  contactIds: string[];
}

export const aiSegments: AISegment[] = [
  { id: 'ai-1', name: 'High-intent fashion followers', count: 12, description: 'Contacts who engaged with style posts and clicked links', contactIds: ['1', '8', '6'] },
  { id: 'ai-2', name: 'Collaboration prospects', count: 4, description: 'Contacts who asked about partnerships or collabs', contactIds: ['2', '7'] },
  { id: 'ai-3', name: 'Coaching leads', count: 6, description: 'Contacts interested in coaching or consultation', contactIds: ['1', '3', '8'] },
];

export const segments: Segment[] = [
  { id: 'warm-fans', name: 'Warm fans', count: contacts.filter(c => c.relationship === 'warm').length, description: 'Contacts showing strong interest', filter: c => c.relationship === 'warm' },
  { id: 'ready-to-convert', name: 'Ready to convert', count: contacts.filter(c => c.relationship === 'ready').length, description: 'High intent, close to action', filter: c => c.relationship === 'ready' },
  { id: 'asked-pricing', name: 'Asked about pricing', count: contacts.filter(c => c.intent === 'pricing').length, description: 'Contacts who asked about pricing', filter: c => c.intent === 'pricing' },
  { id: 'clicked-no-continue', name: 'Clicked but did not continue', count: 12, description: 'Clicked links but no conversion', filter: c => c.intent === 'conversion' && c.stage !== 'converted' },
  { id: 'engaged-ig', name: 'Engaged Instagram contacts', count: contacts.filter(c => c.platform === 'instagram' && c.stage !== 'discovered').length, description: 'Active Instagram followers', filter: c => c.platform === 'instagram' && c.stage !== 'discovered' },
  { id: 'high-intent-tiktok', name: 'High-intent TikTok contacts', count: contacts.filter(c => c.platform === 'tiktok' && (c.intent === 'conversion' || c.intent === 'pricing')).length, description: 'TikTok contacts with strong intent', filter: c => c.platform === 'tiktok' && (c.intent === 'conversion' || c.intent === 'pricing') },
  { id: 'needs-human', name: 'Requires human response', count: contacts.filter(c => c.intent === 'human-review' || c.intent === 'collaboration').length, description: 'Need personal attention', filter: c => c.intent === 'human-review' || c.intent === 'collaboration' },
  { id: 'at-risk', name: 'At risk', count: contacts.filter(c => c.relationship === 'at-risk').length, description: 'Previously active, now quiet', filter: c => c.relationship === 'at-risk' },
  { id: 'duplicates', name: 'Possible duplicates', count: 4, description: 'Profiles that may be the same person', filter: () => false },
];

// ─── Integrations ──────────────────────────────────────────
export interface Integration {
  id: string;
  name: string;
  category: string;
  icon: string;
  status: 'connected' | 'available' | 'coming-soon' | 'needs-attention';
  description: string;
  connectedAccount?: string;
  lastSync?: string;
  syncHealth?: 'healthy' | 'warning' | 'error';
}

export const integrations: Integration[] = [
  { id: 'ig', name: 'Instagram', category: 'Social', icon: 'instagram', status: 'connected', description: 'Direct messages, comments, story replies', connectedAccount: '@mayastyle', lastSync: '2 min ago', syncHealth: 'healthy' },
  { id: 'tt', name: 'TikTok', category: 'Social', icon: 'tiktok', status: 'connected', description: 'Comments, DMs, video interactions', connectedAccount: '@mayastyle', lastSync: '5 min ago', syncHealth: 'healthy' },
  { id: 'yt', name: 'YouTube', category: 'Social', icon: 'youtube', status: 'connected', description: 'Comments, community posts', connectedAccount: 'Maya Chen', lastSync: '1h ago', syncHealth: 'healthy' },
  { id: 'tw', name: 'X / Twitter', category: 'Social', icon: 'twitter', status: 'available', description: 'Mentions, DMs, replies' },
  { id: 'fb', name: 'Facebook', category: 'Social', icon: 'facebook', status: 'available', description: 'Page messages, comments' },
  { id: 'th', name: 'Threads', category: 'Social', icon: 'threads', status: 'coming-soon', description: 'Replies, mentions' },
  { id: 'li', name: 'LinkedIn', category: 'Social', icon: 'linkedin', status: 'coming-soon', description: 'Messages, post interactions' },
  { id: 'shop', name: 'Shopify', category: 'Ecommerce', icon: 'shopify', status: 'coming-soon', description: 'Product links, purchase events' },
  { id: 'event', name: 'Luma', category: 'Events', icon: 'luma', status: 'coming-soon', description: 'Event RSVP tracking' },
];

// ─── Notifications ─────────────────────────────────────────
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'opportunity' | 'alert' | 'insight' | 'system';
  read: boolean;
  time: string;
  link?: string;
}

export const notifications: Notification[] = [
  { id: '1', title: '18 warm fans waiting', message: 'They showed interest but need a follow-up', type: 'opportunity', read: false, time: '10m ago', link: '/inbox' },
  { id: '2', title: 'High intent detected', message: '@design.marc asked about pricing twice', type: 'opportunity', read: false, time: '1h ago', link: '/inbox' },
  { id: '3', title: 'Campaign milestone', message: 'Style Guide Launch hit 50% conversion rate', type: 'insight', read: false, time: '3h ago', link: '/campaigns' },
  { id: '4', title: 'Duplicate profiles found', message: '4 possible duplicates need review', type: 'alert', read: true, time: '1d ago', link: '/contacts' },
  { id: '5', title: 'Weekly summary ready', message: 'Your audience grew by 12 contacts this week', type: 'insight', read: true, time: '2d ago', link: '/' },
];

// ─── Duplicate Profiles ────────────────────────────────────
export interface DuplicateGroup {
  id: string;
  contactIds: string[];
  evidence: string[];
  status: 'pending' | 'merged' | 'dismissed';
}

export const duplicateGroups: DuplicateGroup[] = [
  { id: '1', contactIds: ['1', '6'], evidence: ['Same Instagram handle pattern', 'Similar engagement timing', 'Same city (Los Angeles vs Chicago — both fashion-related)'], status: 'pending' },
];

// ─── Derived / Helper exports ──────────────────────────────
export const warmFans = contacts.filter(c => c.relationship === 'warm' || c.relationship === 'ready');
export const unreadCount = conversations.filter(c => c.unread).length;
export const suggestedActions = [
  { id: '1', text: 'Follow up with contacts who clicked but did not continue', to: '/campaigns/new' },
  { id: '2', text: 'Start a campaign from your highest-intent post', to: '/campaigns/new' },
  { id: '3', text: 'Send a broadcast to warm fans', to: '/campaigns' },
  { id: '4', text: 'Review possible duplicate profiles', to: '/contacts' },
];

// Platform colour helpers
export const platformColors: Record<Platform, string> = {
  instagram: 'bg-gradient-to-br from-pink-500 to-orange-500',
  tiktok: 'bg-black',
  youtube: 'bg-red-600',
  twitter: 'bg-black',
};

// Semantic color system
export const semanticColors: Record<string, { bg: string; text: string; dot: string }> = {
  'warm fan': { bg: 'bg-[#E0F5E9]', text: 'text-[#059669]', dot: 'bg-[#059669]' },
  'ready to convert': { bg: 'bg-[#FFF3E0]', text: 'text-[#D97706]', dot: 'bg-[#D97706]' },
  'engaged': { bg: 'bg-[#FAFAF8]', text: 'text-[#6B6B6B]', dot: 'bg-[#6B6B6B]' },
  'subscriber': { bg: 'bg-[#E0F5E9]', text: 'text-[#059669]', dot: 'bg-[#059669]' },
  'new': { bg: 'bg-[#FAFAF8]', text: 'text-[#6B6B6B]', dot: 'bg-[#6B6B6B]' },
  'high-value': { bg: 'bg-[#FFF3E0]', text: 'text-[#D97706]', dot: 'bg-[#D97706]' },
  'at-risk': { bg: 'bg-[#FEE2E2]', text: 'text-[#DC2626]', dot: 'bg-[#DC2626]' },
  'converted': { bg: 'bg-[#E0F5E9]', text: 'text-[#059669]', dot: 'bg-[#10B981]' },
  'interested': { bg: 'bg-[#FFF3E0]', text: 'text-[#D97706]', dot: 'bg-[#FF6B4A]' },
};

// ─── Intent Groups (AI Audience Intelligence) ──────────────
export interface WeightedSignal {
  name: string;
  weight: number; // 0-100
  description: string;
}

export interface IntentGroup {
  id: string;
  name: string;
  count: number;
  percentage: number;
  avgScore: number; // 0-100
  color: string;
  bg: string;
  description: string;
  signals: WeightedSignal[];
  contactIds: string[];
}

export const intentGroups: IntentGroup[] = [
  {
    id: 'high-intent', name: 'High Intent', count: 8, percentage: 16, avgScore: 87,
    color: 'text-[#059669]', bg: 'bg-[#E0F5E9]',
    description: 'Asked pricing, clicked links, or expressed purchase intent multiple times',
    signals: [
      { name: 'Pricing questions', weight: 35, description: 'Asked about pricing 2+ times' },
      { name: 'Link clicks', weight: 25, description: 'Clicked destination links' },
      { name: 'Repeat engagement', weight: 20, description: 'Engaged 5+ times in 7 days' },
      { name: 'DM replies', weight: 15, description: 'Replied to automated messages' },
      { name: 'Profile visits', weight: 5, description: 'Visited profile from bio link' },
    ],
    contactIds: ['1', '3', '8'],
  },
  {
    id: 'engaged', name: 'Engaged', count: 19, percentage: 38, avgScore: 62,
    color: 'text-[#D97706]', bg: 'bg-[#FFF3E0]',
    description: 'Active engagers who comment, share, and reply consistently',
    signals: [
      { name: 'Comments', weight: 30, description: 'Left meaningful comments on posts' },
      { name: 'Shares', weight: 25, description: 'Shared content to their story/feed' },
      { name: 'Story replies', weight: 20, description: 'Replied to stories 3+ times' },
      { name: 'Live attendance', weight: 15, description: 'Joined live streams' },
      { name: 'Saves', weight: 10, description: 'Saved posts for later' },
    ],
    contactIds: ['2', '5', '6'],
  },
  {
    id: 'interested', name: 'Interested', count: 12, percentage: 24, avgScore: 48,
    color: 'text-[#7C3AED]', bg: 'bg-[#EDE9FE]',
    description: 'Showed initial interest but need nurturing before conversion',
    signals: [
      { name: 'First click', weight: 35, description: 'Clicked a link for the first time' },
      { name: 'Keyword match', weight: 25, description: 'Used campaign keywords in comments' },
      { name: 'Profile visit', weight: 20, description: 'Visited from bio link' },
      { name: 'Story view', weight: 15, description: 'Viewed 5+ stories' },
      { name: 'Like pattern', weight: 5, description: 'Liked 3+ posts in a row' },
    ],
    contactIds: ['7'],
  },
  {
    id: 'casual', name: 'Casual', count: 8, percentage: 16, avgScore: 28,
    color: 'text-[#6B6B6B]', bg: 'bg-[#FAFAF8]',
    description: 'Passive followers who like occasionally but rarely engage deeply',
    signals: [
      { name: 'Likes only', weight: 45, description: 'Only likes, no comments or DMs' },
      { name: 'Low frequency', weight: 30, description: 'Engages less than once per week' },
      { name: 'No link clicks', weight: 20, description: 'Never clicked a destination link' },
      { name: 'Story views', weight: 5, description: 'Occasional story views' },
    ],
    contactIds: ['4'],
  },
  {
    id: 'at-risk', name: 'At Risk', count: 3, percentage: 6, avgScore: 15,
    color: 'text-[#DC2626]', bg: 'bg-[#FEE2E2]',
    description: 'Previously active but engagement has dropped significantly',
    signals: [
      { name: 'Engagement drop', weight: 40, description: '70% decrease in activity' },
      { name: 'No recent clicks', weight: 30, description: 'No link clicks in 30 days' },
      { name: 'Unread messages', weight: 20, description: 'Left DMs unread' },
      { name: 'Unfollow signal', weight: 10, description: 'Reduced story views' },
    ],
    contactIds: [],
  },
];

// ─── Campaign / Automation Templates ───────────────────────
export interface CampaignTemplate {
  id: string;
  name: string;
  category: string;
  goal: string;
  description: string;
  triggerType: string;
  messageTemplate: string;
  destinationUrl: string;
  followUpMessage: string;
  platforms: string[];
  estimatedConversion: string;
}

export const campaignTemplates: CampaignTemplate[] = [
  {
    id: 't1', name: 'Comment-to-DM Guide', category: 'Lead Magnet', goal: 'Grow newsletter',
    description: 'When someone comments a keyword on your post, automatically send them a DM with your guide link.',
    triggerType: 'Keyword in comments', messageTemplate: "Hey {first_name}! Thanks for your interest. Here's the guide I promised: {destination_url}",
    destinationUrl: 'populr.club/guide', followUpMessage: 'Hey! Just checking — did you get the guide? Let me know what you think!',
    platforms: ['instagram', 'tiktok'], estimatedConversion: '35-50%',
  },
  {
    id: 't2', name: 'Coaching Discovery', category: 'Booking', goal: 'Book clients',
    description: 'Convert interested followers into coaching clients with an automated discovery call funnel.',
    triggerType: 'High intent signal', messageTemplate: "Hi {first_name}! I noticed you're interested in coaching. Want to book a free 15-min discovery call? {destination_url}",
    destinationUrl: 'populr.club/book', followUpMessage: 'No pressure at all! If timing is bad, just reply and we can find something that works.',
    platforms: ['instagram', 'tiktok'], estimatedConversion: '20-35%',
  },
  {
    id: 't3', name: 'Community Invite', category: 'Community', goal: 'Promote paid community',
    description: 'Invite engaged followers to join your exclusive community with a personalized message.',
    triggerType: 'Engagement threshold', messageTemplate: "Hey {first_name}! You've been so engaged with my content — I'd love to invite you to our private community: {destination_url}",
    destinationUrl: 'populr.club/community', followUpMessage: 'The community is growing fast! Here is what members are saying about it...',
    platforms: ['instagram', 'tiktok'], estimatedConversion: '15-25%',
  },
  {
    id: 't4', name: 'Product Launch', category: 'Sales', goal: 'Launch digital product',
    description: 'Build anticipation and drive sales for your digital product launch.',
    triggerType: 'Pre-launch signup', messageTemplate: "{first_name}! The wait is over. Your exclusive early access link is here: {destination_url}",
    destinationUrl: 'populr.club/launch', followUpMessage: 'Early access closes in 24 hours! Here is a sneak peek of what is inside...',
    platforms: ['instagram', 'tiktok', 'youtube'], estimatedConversion: '25-40%',
  },
  {
    id: 't5', name: 'Event RSVP', category: 'Events', goal: 'Drive event signups',
    description: 'Drive signups for your webinar, livestream, or in-person event.',
    triggerType: 'Event interest', messageTemplate: "Hi {first_name}! You expressed interest in the event. Here is your RSVP link: {destination_url}",
    destinationUrl: 'populr.club/event', followUpMessage: 'The event is tomorrow! Here is what you need to know + a calendar invite.',
    platforms: ['instagram', 'twitter'], estimatedConversion: '40-60%',
  },
  {
    id: 't6', name: 'Welcome Sequence', category: 'Onboarding', goal: 'Build relationships',
    description: 'Automatically welcome new contacts and introduce them to your best content.',
    triggerType: 'First engagement', messageTemplate: "Hey {first_name}! Welcome to the community. Here are my 3 best guides to get you started: {destination_url}",
    destinationUrl: 'populr.club/welcome', followUpMessage: 'How are you enjoying the guides so far? I would love your feedback!',
    platforms: ['instagram', 'tiktok'], estimatedConversion: '30-45%',
  },
  {
    id: 't7', name: 'Collaboration Filter', category: 'Partnerships', goal: 'Manage inbound collabs',
    description: 'Automatically qualify and respond to collaboration requests.',
    triggerType: 'Collaboration DM', messageTemplate: "Thanks for reaching out, {first_name}! I would love to learn more. Could you fill out this quick form? {destination_url}",
    destinationUrl: 'populr.club/collab', followUpMessage: 'Just following up — still interested in collaborating?',
    platforms: ['instagram', 'tiktok', 'twitter'], estimatedConversion: '50-70%',
  },
  {
    id: 't8', name: 'Re-engagement', category: 'Retention', goal: 'Win back at-risk contacts',
    description: 'Re-engage contacts whose activity has dropped off.',
    triggerType: 'Inactivity 14 days', messageTemplate: "Hey {first_name}! I miss seeing you around. Here is something I think you will love: {destination_url}",
    destinationUrl: 'populr.club/comeback', followUpMessage: 'One last thing — I am doing a Q&A this week and would love your questions!',
    platforms: ['instagram', 'tiktok'], estimatedConversion: '10-20%',
  },
  {
    id: 't9', name: 'Testimonial Request', category: 'Social Proof', goal: 'Collect testimonials',
    description: 'Ask converted contacts for testimonials after they have experienced your product.',
    triggerType: 'Post-conversion', messageTemplate: "So glad you loved it, {first_name}! Would you mind sharing a quick testimonial? {destination_url}",
    destinationUrl: 'populr.club/testimonial', followUpMessage: 'Your testimonial would help so many others make the right decision. No pressure though!',
    platforms: ['instagram'], estimatedConversion: '40-55%',
  },
  {
    id: 't10', name: 'Flash Sale', category: 'Sales', goal: 'Drive quick sales',
    description: 'Create urgency with a time-limited discount for engaged contacts.',
    triggerType: 'Engaged segment', messageTemplate: "{first_name}! Flash sale — 24 hours only. Get 30% off with this link: {destination_url}",
    destinationUrl: 'populr.club/sale', followUpMessage: '6 hours left! Here is what others are buying right now...',
    platforms: ['instagram', 'tiktok'], estimatedConversion: '20-30%',
  },
  {
    id: 't11', name: 'Newsletter Growth', category: 'Lead Magnet', goal: 'Grow newsletter',
    description: 'Convert social followers into email subscribers with a lead magnet.',
    triggerType: 'Content engagement', messageTemplate: "Want the full guide delivered to your inbox, {first_name}? Subscribe here: {destination_url}",
    destinationUrl: 'populr.club/subscribe', followUpMessage: 'Your guide is on its way! While you wait, here is a preview of this week\'s newsletter.',
    platforms: ['instagram', 'twitter', 'youtube'], estimatedConversion: '35-50%',
  },
];

// ─── Connected Account State (mutable, for onboarding) ─────
export type AccountStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface OnboardingPlatform {
  id: string;
  name: string;
  icon: string;
  status: AccountStatus;
  handle?: string;
}

export const defaultOnboardingPlatforms: OnboardingPlatform[] = [
  { id: 'instagram', name: 'Instagram', icon: 'instagram', status: 'idle' },
  { id: 'tiktok', name: 'TikTok', icon: 'tiktok', status: 'idle' },

  { id: 'twitter', name: 'X / Twitter', icon: 'twitter', status: 'idle' },
  { id: 'youtube', name: 'YouTube', icon: 'youtube', status: 'idle' },
];

// Audience goals for onboarding
export const audienceGoals = [
  { id: 'audience', label: 'Build audience', description: 'Grow your follower base and engagement', icon: 'users' },
  { id: 'ads', label: 'Run ad campaigns', description: 'Drive paid traffic and conversions', icon: 'mail' },

  { id: 'products', label: 'Sell digital products', description: 'Promote and sell your products', icon: 'package' },
  { id: 'coaching', label: 'Book coaching calls', description: 'Get more discovery call bookings', icon: 'calendar' },
  { id: 'other', label: 'Other', description: 'Tell us what you are building', icon: 'more-horizontal' },
];

// Analysis steps for onboarding
export const analysisSteps = [
  { id: 'comments', label: 'Recent comments', count: 156 },
  { id: 'dms', label: 'Direct messages', count: 89 },
  { id: 'engagement', label: 'Repeated engagement', count: 64 },
  { id: 'clicks', label: 'Link clicks', count: 47 },
  { id: 'offers', label: 'Offer-related conversations', count: 34 },
  { id: 'sentiment', label: 'Intent sentiment analysis', count: 50 },
];

// ─── Connected Accounts (richer state for Settings) ────────
export type ConnectedAccountStatus = 'idle' | 'connecting' | 'syncing' | 'connected' | 'needs-attention' | 'disconnected';

export interface ConnectedAccount {
  id: string;
  platform: string;
  icon: string;
  displayName: string;
  handle: string;
  avatar: string;
  status: ConnectedAccountStatus;
  isPrimary: boolean;
  lastSynced: string;
  permissions: string[];
}

export const defaultConnectedAccounts: ConnectedAccount[] = [
  { id: 'ig', platform: 'Instagram', icon: 'instagram', displayName: 'Maya Chen', handle: '@mayastyle', avatar: '/images/avatar-maya.jpg', status: 'connected', isPrimary: true, lastSynced: '2 min ago', permissions: ['Read DMs', 'Read comments', 'Read profile', 'Send messages'] },
  { id: 'tt', platform: 'TikTok', icon: 'tiktok', displayName: 'Maya Chen', handle: '@mayastyle', avatar: '/images/avatar-maya.jpg', status: 'connected', isPrimary: false, lastSynced: '5 min ago', permissions: ['Read comments', 'Read profile', 'Read videos'] },
  { id: 'yt', platform: 'YouTube', icon: 'youtube', displayName: 'Maya Chen', handle: 'Maya Chen', avatar: '/images/avatar-maya.jpg', status: 'connected', isPrimary: false, lastSynced: '1h ago', permissions: ['Read comments', 'Read profile'] },
  { id: 'tw', platform: 'X / Twitter', icon: 'twitter', displayName: '', handle: '', avatar: '', status: 'idle', isPrimary: false, lastSynced: '', permissions: ['Read DMs', 'Read mentions', 'Read profile', 'Post tweets'] },
  { id: 'fb', platform: 'Facebook', icon: 'facebook', displayName: '', handle: '', avatar: '', status: 'idle', isPrimary: false, lastSynced: '', permissions: ['Read page messages', 'Read comments', 'Read profile'] },
  { id: 'li', platform: 'LinkedIn', icon: 'linkedin', displayName: '', handle: '', avatar: '', status: 'idle', isPrimary: false, lastSynced: '', permissions: ['Read messages', 'Read profile', 'Read posts'] },
  { id: 'th', platform: 'Threads', icon: 'threads', displayName: '', handle: '', avatar: '', status: 'idle', isPrimary: false, lastSynced: '', permissions: ['Read replies', 'Read profile'] },
  { id: 'wa', platform: 'WhatsApp', icon: 'whatsapp', displayName: '', handle: '', avatar: '', status: 'idle', isPrimary: false, lastSynced: '', permissions: ['Read messages', 'Send messages', 'Read profile'] },
  { id: 'pi', platform: 'Pinterest', icon: 'pinterest', displayName: '', handle: '', avatar: '', status: 'idle', isPrimary: false, lastSynced: '', permissions: ['Read pins', 'Read profile', 'Read boards'] },
];

// ─── Team Members ──────────────────────────────────────────
export type TeamRole = 'owner' | 'manager' | 'community-manager' | 'viewer';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: TeamRole;
  assignedConversations: number;
  assignedCampaigns: number;
  joinedAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: TeamRole;
  invitedAt: string;
  status: 'pending' | 'accepted' | 'expired';
}

export const roleDescriptions: Record<TeamRole, { label: string; description: string }> = {
  owner: { label: 'Owner', description: 'Full control. Cannot be assigned through invitation.' },
  manager: { label: 'Manager', description: 'Manage campaigns, automations, contacts, broadcasts, and team activity.' },
  'community-manager': { label: 'Community Manager', description: 'Manage Inbox, contacts, notes, tags, and assigned campaigns.' },
  viewer: { label: 'Viewer', description: 'Read-only access to dashboards, contacts, campaigns, and analytics.' },
};

export const defaultTeamMembers: TeamMember[] = [
  { id: '1', name: 'Maya Chen', email: 'maya@populr.co', avatar: '/images/avatar-maya.jpg', role: 'owner', assignedConversations: 0, assignedCampaigns: 2, joinedAt: 'Jan 2024' },
];

// ─── Privacy & Consent settings ────────────────────────────
export interface PrivacySettings {
  storeConversations: boolean;
  useAiAnalysis: boolean;
  shareAnonymized: boolean;
  autoDeleteInactive: boolean;
  dataRetentionDays: number;
}

export const defaultPrivacySettings: PrivacySettings = {
  storeConversations: true,
  useAiAnalysis: true,
  shareAnonymized: false,
  autoDeleteInactive: false,
  dataRetentionDays: 90,
};
