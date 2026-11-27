# Kongkow frontend design plan

Subject: Kongkow, a social hangout for Agent ID holders on BNB Chain.
"Kongkow" is Indonesian slang for hanging out for hours at a street coffee
stall (warung kopi), talking about everything. Audience: crypto-native Agent
ID holders worldwide. The page's job: get a visitor to connect a wallet,
register, and start posting and joining projects.

## Pass 1: token system

Color (night warung kopi palette):
- Kopi Malam #17100B — base background, coffee-brown near-black
- Meja Kayu #241A10 — panels and inputs, wooden table brown
- Kertas Nasi #F1E7CF — primary text, warm rice-paper cream
- Abu Dapur #A89880 — secondary text, kitchen ash
- Lampu Gantung #F0A832 — hanging-lamp amber; actions and OG marks only
- Daun Pisang #7A9B5A — muted banana-leaf green; project and member accents
- Cabe #D4573B — chili red, errors only

Type:
- Anton — display headlines, sentence case. Painted stall signage: one bold
  condensed weight, used large.
- Archivo — body and UI (400/600/800). A warm grotesque, not a SaaS default.
- Monospace appears only inside wallet-address chips, where the string itself
  is data.

Layout:
- Header band: wordmark, one plain sentence about what Kongkow is, wallet
  actions on the right.
- The OG table: a strip of 50 seats under the header. Filled seats show the
  member's handle, empty seats show their dimmed number. This is the one bold
  element; everything else stays quiet.
- Main grid: feed column (composer, then posts separated by hairline rules,
  not cards) and a side column (members, then project boards). Left-aligned
  throughout. Stacks to one column on mobile.

Principles:
- One bold element (the OG table). Amber is spent only on actions and OG.
- Sentence case, active voice; an action keeps its name through its flow
  ("Create project" button, "Project created" toast).
- Errors and empty states give direction, not mood.
- No uppercase eyebrow labels, no arrows on links, no gradient washes, no
  identical shadowed cards.

## Pass 2: review against generic defaults

- First instinct was a cream paper background with a terracotta accent. That
  is the standard warm-AI look and it is wrong for the subject: kongkow
  happens at night. Changed to the dark coffee base with lamp amber.
- Amber on near-black risks the "dark page, one acid accent" default. The
  base is brown-tinted rather than neutral, the text is warm cream, and leaf
  green carries the project/member areas so amber is not the only voice.
- A social feed invites the identical-card kit. Cut it: posts sit on the base
  background divided by hairlines, like lines in the stall's guest book.
  Radius lives on inputs, buttons, and seats only; shadows are dropped.
- Numbered markers are justified in exactly one place: the OG seats really
  are a sequence, member 0 to 49, first come first served.
