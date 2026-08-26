# Pre-Production Security Requirements

**MANDATORY SKILL BEFORE ANY PRODUCTION DEPLOYMENT**

The skill `/owasp-security` must be invoked before any system is deployed to production. This skill performs comprehensive OWASP compliance analysis, security vulnerability detection, and compliance validation.

**Activation points:**
- Before any code merge to `main`/`master` branch destined for production
- Before container image push to production registry
- Before database migrations to production environment
- In CI/CD pipelines as a mandatory gate step

Invoke with: `/owasp-security` or include it in the pre-production checklist workflow.
