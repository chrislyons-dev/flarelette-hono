workspace "flarelette-hono" "Type-safe JWT authentication middleware for Hono on Cloudflare Workers" {

    model {
        # flarelette-hono System
        flarelette_hono = softwareSystem "flarelette-hono" {
            description "Type-safe JWT authentication middleware for Hono on Cloudflare Workers"
            # Containers




            chrislyons_dev_flarelette_hono = container "@chrislyons-dev/flarelette-hono" {
                description "Type-safe JWT authentication middleware for Hono on Cloudflare Workers"
                technology "Service"
                tags "Service,Auto-generated"

                # Components
                chrislyons_dev_flarelette_hono__main = component "main" {
                    description "flarelette-hono - Type-safe JWT authentication middleware for Hono Framework adapter for Cloudflare Workers built on Hono + Flarelette JWT. Provides declarative JWT authentication and policy enforcement."
                    technology "module"
                }
                chrislyons_dev_flarelette_hono__logging = component "logging" {
                    description "Structured logging for Hono applications Provides ADR-0013 compliant structured logging using hono-pino. This is a thin wrapper that configures pino with the correct schema for polyglot microservice consistency."
                    technology "module"
                }
                chrislyons_dev_flarelette_hono__middleware = component "middleware" {
                    description "Authentication middleware for Hono Provides JWT authentication and authorization for Hono applications on Cloudflare Workers."
                    technology "module"
                }
                chrislyons_dev_flarelette_hono__policy_builder = component "policy-builder" {
                    description "Policy builder for declarative JWT authorization Provides fluent API for constructing authorization policies based on JWT claims."
                    technology "module"
                }
                chrislyons_dev_flarelette_hono__types = component "types" {
                    description "Type definitions for flarelette-hono Re-exports types from"
                    technology "module"
                }

                # Code elements (classes, functions)
                chrislyons_dev_flarelette_hono__logging__formatlevel = component "logging.formatLevel" {
                    description "Format log level as string (ADR-0013 requirement) Pino formats levels as numbers by default, but ADR-0013 requires string levels."
                    technology "function"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__logging__generatetimestamp = component "logging.generateTimestamp" {
                    description "Generate ISO 8601 timestamp for logs (ADR-0013 requirement) Returns current timestamp in ISO 8601 format with milliseconds, formatted as a JSON fragment for Pino."
                    technology "function"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__logging__extractrequestid = component "logging.extractRequestId" {
                    description "Request ID extractor for correlation (ADR-0013 requirement) Returns undefined to let hono-pino automatically extract X-Request-ID header. This enables distributed tracing across service boundaries."
                    technology "function"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__logging__createlogger = component "logging.createLogger" {
                    description "Create ADR-0013 compliant structured logger Returns a Hono middleware that automatically logs request start/completion and provides a structured logger instance in the context. **ADR-0013 Schema:** ```json { \"timestamp\": \"2025-11-02T12:34:56.789Z\", \"level\": \"info\", \"service\": \"bond-valuation\", \"requestId\": \"uuid-v4\", \"message\": \"Request completed\", \"duration\": 125, \"method\": \"POST\", \"path\": \"/api/price\", \"status\": 200 } ``` **Request Correlation:** The logger automatically extracts and propagates `X-Request-ID` header for distributed tracing across service boundaries."
                    technology "function"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__middleware__extractbearertoken = component "middleware.extractBearerToken" {
                    description "Extract Bearer token from Authorization header"
                    technology "function"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__middleware__authguard = component "middleware.authGuard" {
                    description "Authentication guard middleware Verifies JWT tokens and optionally enforces authorization policies. Injects verified payload into context as `auth` variable."
                    technology "function"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policy = component "policy-builder.policy" {
                    description "Create a new policy builder"
                    technology "function"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policyimpl = component "policy-builder.PolicyImpl" {
                    description "Concrete policy implementation Evaluates rules against JWT payload to determine access."
                    technology "class"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluate = component "policy-builder.PolicyImpl.evaluate" {
                    technology "method"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluaterule = component "policy-builder.PolicyImpl.evaluateRule" {
                    technology "method"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluaterolesany = component "policy-builder.PolicyImpl.evaluateRolesAny" {
                    technology "method"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluaterolesall = component "policy-builder.PolicyImpl.evaluateRolesAll" {
                    technology "method"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluateneedany = component "policy-builder.PolicyImpl.evaluateNeedAny" {
                    technology "method"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluateneedall = component "policy-builder.PolicyImpl.evaluateNeedAll" {
                    technology "method"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl = component "policy-builder.PolicyBuilderImpl" {
                    description "Policy builder implementation Fluent API for constructing authorization policies."
                    technology "class"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl_rolesany = component "policy-builder.PolicyBuilderImpl.rolesAny" {
                    technology "method"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl_rolesall = component "policy-builder.PolicyBuilderImpl.rolesAll" {
                    technology "method"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl_needany = component "policy-builder.PolicyBuilderImpl.needAny" {
                    technology "method"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl_needall = component "policy-builder.PolicyBuilderImpl.needAll" {
                    technology "method"
                    tags "Code"
                }
                chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl_build = component "policy-builder.PolicyBuilderImpl.build" {
                    technology "method"
                    tags "Code"
                }

                # Component relationships
                chrislyons_dev_flarelette_hono__main -> chrislyons_dev_flarelette_hono__middleware "authentication middleware"
                chrislyons_dev_flarelette_hono__main -> chrislyons_dev_flarelette_hono__policy_builder "policy builder"
                chrislyons_dev_flarelette_hono__main -> chrislyons_dev_flarelette_hono__logging "structured logging middleware"
                chrislyons_dev_flarelette_hono__middleware -> chrislyons_dev_flarelette_hono__types "environment and policy types"
                chrislyons_dev_flarelette_hono__policy_builder -> chrislyons_dev_flarelette_hono__types "policy types"
            }





            flarelette_hono_authenticated_example = container "flarelette-hono-authenticated-example" {
                description "Service: flarelette-hono-authenticated-example"
                technology "Service"
                tags "Service,Auto-generated"
            }





            flarelette_hono_minimal_example = container "flarelette-hono-minimal-example" {
                description "Service: flarelette-hono-minimal-example"
                technology "Service"
                tags "Service,Auto-generated"
            }

        }
    }

    views {
/**
 * Default Structurizr theme for Archlette
 * 
 * This theme provides a modern, professional color scheme for architecture diagrams
 * with clear visual hierarchy and accessibility considerations.
 */

theme default

// Element styles
styles {
    // Person/Actor styles
    element "Person" {
        background #08427b
        color #ffffff
        shape Person
        fontSize 22
    }

    // External System styles
    element "External System" {
        background #999999
        color #ffffff
        shape RoundedBox
        fontSize 22
    }

    element "External" {
        background #999999
        color #ffffff
        shape RoundedBox
        fontSize 22
    }

    // System styles
    element "Software System" {
        background #1168bd
        color #ffffff
        shape RoundedBox
        fontSize 24
    }

    // Container styles
    element "Container" {
        background #438dd5
        color #ffffff
        shape RoundedBox
        fontSize 20
    }

    element "Database" {
        background #438dd5
        color #ffffff
        shape Cylinder
        fontSize 20
    }

    element "Web Browser" {
        background #438dd5
        color #ffffff
        shape WebBrowser
        fontSize 20
    }

    element "Mobile App" {
        background #438dd5
        color #ffffff
        shape MobileDevicePortrait
        fontSize 20
    }

    // Component styles
    element "Component" {
        background #85bbf0
        color #000000
        shape RoundedBox
        fontSize 18
    }

    // Technology-specific styles
    element "Cloudflare Worker" {
        background #f6821f
        color #ffffff
        shape RoundedBox
        fontSize 18
    }

    element "Service" {
        background #438dd5
        color #ffffff
        shape RoundedBox
        fontSize 18
    }

    element "API" {
        background #85bbf0
        color #000000
        shape Hexagon
        fontSize 18
    }

    element "Queue" {
        background #85bbf0
        color #000000
        shape Pipe
        fontSize 18
    }

    // Tag-based styles
    element "Internal System" {
        background #1168bd
        color #ffffff
    }

    element "Deprecated" {
        background #cc0000
        color #ffffff
        opacity 60
    }

    element "Future" {
        background #dddddd
        color #000000
        opacity 50
        stroke #999999
        strokeWidth 2
    }

    element "Auto Generated" {
        stroke #999999
        strokeWidth 1
    }

    // Infrastructure styles
    element "Infrastructure" {
        background #92278f
        color #ffffff
        shape RoundedBox
    }

    element "Message Bus" {
        background #85bbf0
        color #000000
        shape Pipe
    }

    // Relationship styles
    relationship "Relationship" {
        color #707070
        dashed false
        routing Curved
        fontSize 12
        thickness 2
    }

    relationship "Async" {
        dashed true
        color #707070
    }

    relationship "Sync" {
        dashed false
        color #707070
    }

    relationship "Uses" {
        color #707070
        dashed false
    }

    relationship "Depends On" {
        color #707070
        dashed true
    }
}

// Diagram customization
branding {
    font "Arial"
}


        systemContext flarelette_hono "SystemContext" {
            include flarelette_hono
            autoLayout
        }

        container flarelette_hono "Containers" {
            include chrislyons_dev_flarelette_hono
            include flarelette_hono_authenticated_example
            include flarelette_hono_minimal_example
            autoLayout
        }


        component chrislyons_dev_flarelette_hono "Components__chrislyons_dev_flarelette_hono" {
            include chrislyons_dev_flarelette_hono__main
            include chrislyons_dev_flarelette_hono__logging
            include chrislyons_dev_flarelette_hono__middleware
            include chrislyons_dev_flarelette_hono__policy_builder
            include chrislyons_dev_flarelette_hono__types
            exclude "element.tag==Code"
            autoLayout
        }


        component chrislyons_dev_flarelette_hono "Classes_chrislyons_dev_flarelette_hono__logging" {
            include chrislyons_dev_flarelette_hono__logging__formatlevel
            include chrislyons_dev_flarelette_hono__logging__generatetimestamp
            include chrislyons_dev_flarelette_hono__logging__extractrequestid
            include chrislyons_dev_flarelette_hono__logging__createlogger
            autoLayout
        }


        component chrislyons_dev_flarelette_hono "Classes_chrislyons_dev_flarelette_hono__middleware" {
            include chrislyons_dev_flarelette_hono__middleware__extractbearertoken
            include chrislyons_dev_flarelette_hono__middleware__authguard
            autoLayout
        }


        component chrislyons_dev_flarelette_hono "Classes_chrislyons_dev_flarelette_hono__policy_builder" {
            include chrislyons_dev_flarelette_hono__policy_builder__policy
            include chrislyons_dev_flarelette_hono__policy_builder__policyimpl
            include chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluate
            include chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluaterule
            include chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluaterolesany
            include chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluaterolesall
            include chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluateneedany
            include chrislyons_dev_flarelette_hono__policy_builder__policyimpl_evaluateneedall
            include chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl
            include chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl_rolesany
            include chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl_rolesall
            include chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl_needany
            include chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl_needall
            include chrislyons_dev_flarelette_hono__policy_builder__policybuilderimpl_build
            autoLayout
        }

    }

}
