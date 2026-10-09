---
name: Template Studio scope
description: Durable architecture and artist-brand constraints for Template Studio.
---

Template Studio is a 100% client-side browser app that exports as a static site; no backend, database, or cloud runtime is acceptable. It should work for any music project. The initial user is TRP8; visible artist branding is exactly TRP8, and the default artist field is TRP8.

**Why:** These are explicit product requirements from the user.

**How to apply:** Keep rendering, project data, and file handling in the browser. Do not add server persistence or change the visible artist name.
