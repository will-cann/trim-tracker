-- 051: Seed a library of preset extraction SOPs
--
-- Populates 18 common extraction workflows so new companies don't start from
-- a blank slate. Each SOP is marked is_preset=true and includes:
--   - accepted_inputs / producible_outputs tied to the product catalog
--   - standard_batch_size_g = minimum output worth testing
--   - Per-step input/output/equipment/yield/duration estimates
--
-- Yields and durations are reasonable industry averages — operators are
-- expected to edit these on first run and dial them in from real data.

-- ── Helper function ──────────────────────────────────────────────────────
-- Seeds one template + steps for one company. Idempotent: skips if a preset
-- with the same name already exists for the company.

CREATE OR REPLACE FUNCTION _seed_sop(
    p_company_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_process_type TEXT,
    p_accepted TEXT[],
    p_produces TEXT[],
    p_batch_size INT,
    p_steps JSONB
) RETURNS VOID AS $$
DECLARE
    tmpl_id UUID;
    step JSONB;
    i INT := 1;
BEGIN
    IF EXISTS (
        SELECT 1 FROM process_templates
        WHERE company_id = p_company_id
          AND name = p_name
          AND is_preset = true
    ) THEN
        RETURN;
    END IF;

    INSERT INTO process_templates (
        company_id, name, description, process_type,
        accepted_inputs, producible_outputs, standard_batch_size_g,
        is_preset, domain
    )
    VALUES (
        p_company_id, p_name, p_description, p_process_type,
        p_accepted, p_produces, p_batch_size,
        true, 'extraction'
    )
    RETURNING id INTO tmpl_id;

    FOR step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
        INSERT INTO process_steps (
            template_id, step_order, name, description,
            input_type, output_type, equipment_type,
            expected_yield_pct, est_duration_hours, est_hands_on_hours, is_optional
        )
        VALUES (
            tmpl_id,
            i,
            step->>'name',
            step->>'desc',
            step->>'input',
            step->>'output',
            NULLIF(step->>'equip', ''),
            (step->>'yield')::numeric,
            (step->>'hours')::numeric,
            NULLIF(step->>'handsOn', '')::numeric,
            COALESCE((step->>'optional')::boolean, false)
        );
        i := i + 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ── Seed every company with the preset library ──────────────────────────
DO $$
DECLARE
    c RECORD;
BEGIN
FOR c IN SELECT id FROM companies LOOP

-- ═══════════════════════════════════════════════════════════════════════
-- SOLVENTLESS PATHWAY
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Fresh Frozen → Bubble Hash (stop after freeze dry)
PERFORM _seed_sop(c.id,
    'Solventless: Fresh Frozen to Bubble Hash',
    'Ice water hash extraction, freeze dried. Use when hash itself is the final product — no pressing.',
    'solventless',
    ARRAY['fresh_frozen'],
    ARRAY['bubble_hash'],
    500,
    '[
        {"name":"Wash","desc":"Ice water agitation through 45u/73u/120u/160u micron bags. Collect the 73-120u fractions as primary yield.","input":"fresh_frozen","output":"bubble_hash","equip":"wash_vessel","yield":5,"hours":2,"handsOn":1.5},
        {"name":"Freeze Dry","desc":"Sublimation drying 24-48h. Remove water without melting trichome heads.","input":"bubble_hash","output":"bubble_hash","equip":"freeze_dryer","yield":96,"hours":30,"handsOn":0.25},
        {"name":"QC & Package","desc":"Sift, grade, weigh, package for sale or further processing.","input":"bubble_hash","output":"bubble_hash","equip":"","yield":99,"hours":1,"handsOn":1}
    ]'::jsonb
);

-- 2. Fresh Frozen → Live Rosin Jar
PERFORM _seed_sop(c.id,
    'Solventless: Fresh Frozen to Live Rosin Jar',
    'Full cold-cure pipeline — ice water hash, freeze dry, press, cold cure in jar for stable consistency.',
    'solventless',
    ARRAY['fresh_frozen'],
    ARRAY['live_rosin'],
    500,
    '[
        {"name":"Wash","desc":"Ice water hash run through 45-160u bags.","input":"fresh_frozen","output":"bubble_hash","equip":"wash_vessel","yield":5,"hours":2,"handsOn":1.5},
        {"name":"Freeze Dry","desc":"24-48h sublimation cycle.","input":"bubble_hash","output":"bubble_hash","equip":"freeze_dryer","yield":96,"hours":30,"handsOn":0.25},
        {"name":"Press","desc":"Heat and pressure through 37-90u bags. ~180-200°F typical.","input":"bubble_hash","output":"live_rosin","equip":"rosin_press","yield":62,"hours":1.5,"handsOn":1.5},
        {"name":"Cold Cure","desc":"Jar and cure at 55-65°F for 48-96h to stabilize consistency.","input":"live_rosin","output":"live_rosin","equip":"","yield":99,"hours":72,"handsOn":0.25}
    ]'::jsonb
);

-- 3. Fresh Frozen → Live Rosin Badder
PERFORM _seed_sop(c.id,
    'Solventless: Fresh Frozen to Live Rosin Badder',
    'Whipped live rosin with creamy, aerated texture. Same press, different cure technique.',
    'solventless',
    ARRAY['fresh_frozen'],
    ARRAY['live_rosin_badder'],
    500,
    '[
        {"name":"Wash","desc":"Ice water hash run.","input":"fresh_frozen","output":"bubble_hash","equip":"wash_vessel","yield":5,"hours":2,"handsOn":1.5},
        {"name":"Freeze Dry","desc":"24-48h sublimation cycle.","input":"bubble_hash","output":"bubble_hash","equip":"freeze_dryer","yield":96,"hours":30,"handsOn":0.25},
        {"name":"Press","desc":"Slightly higher temp (195-210°F) for badder-friendly starting consistency.","input":"bubble_hash","output":"live_rosin","equip":"rosin_press","yield":62,"hours":1.5,"handsOn":1.5},
        {"name":"Whip & Cure","desc":"Hand-whip or stir to incorporate air, then cure at 70-75°F for 24-72h until texture stabilizes.","input":"live_rosin","output":"live_rosin_badder","equip":"","yield":98,"hours":48,"handsOn":1}
    ]'::jsonb
);

-- 4. Fresh Frozen → Live Rosin Carts
PERFORM _seed_sop(c.id,
    'Solventless: Fresh Frozen to Live Rosin Carts',
    'Full cart pipeline — wash, freeze dry, press, decarb, fill cartridges.',
    'solventless',
    ARRAY['fresh_frozen'],
    ARRAY['live_rosin_cart'],
    500,
    '[
        {"name":"Wash","desc":"Ice water hash run.","input":"fresh_frozen","output":"bubble_hash","equip":"wash_vessel","yield":5,"hours":2,"handsOn":1.5},
        {"name":"Freeze Dry","desc":"24-48h sublimation cycle.","input":"bubble_hash","output":"bubble_hash","equip":"freeze_dryer","yield":96,"hours":30,"handsOn":0.25},
        {"name":"Press","desc":"Press at cart-friendly temp (200-220°F) for better flow.","input":"bubble_hash","output":"live_rosin","equip":"rosin_press","yield":62,"hours":1.5,"handsOn":1.5},
        {"name":"Decarb","desc":"Vacuum oven at ~220°F for 30-45 min to activate.","input":"live_rosin","output":"live_rosin","equip":"vacuum_oven","yield":95,"hours":1,"handsOn":0.5},
        {"name":"Fill Carts","desc":"Fill 0.5g or 1g cartridges with decarbed rosin. Cap and test.","input":"live_rosin","output":"live_rosin_cart","equip":"cart_filler","yield":95,"hours":2,"handsOn":2},
        {"name":"Package","desc":"Label, box, compliance check.","input":"live_rosin_cart","output":"live_rosin_cart","equip":"","yield":100,"hours":1,"handsOn":1}
    ]'::jsonb
);

-- 5. Dry Flower → Rosin (direct press)
PERFORM _seed_sop(c.id,
    'Solventless: Dry Flower to Rosin',
    'Direct press from cured flower — simpler but lower yield. Good for small batches or flower rosin SKUs.',
    'solventless',
    ARRAY['flower'],
    ARRAY['rosin'],
    500,
    '[
        {"name":"Prep","desc":"Break up flower, load into 37-90u rosin bags.","input":"flower","output":"flower","equip":"","yield":100,"hours":0.5,"handsOn":0.5},
        {"name":"Press","desc":"~180-220°F, 700-1500 psi. Multiple squishes per bag.","input":"flower","output":"rosin","equip":"rosin_press","yield":18,"hours":2,"handsOn":2}
    ]'::jsonb
);

-- 6. Dry Trim → Dry Sift
PERFORM _seed_sop(c.id,
    'Solventless: Dry Trim to Dry Sift',
    'Mechanical trichome separation using dry screens. No water, no solvent. Traditional technique.',
    'solventless',
    ARRAY['dry_trim', 'trim', 'shake'],
    ARRAY['dry_sift', 'kief'],
    500,
    '[
        {"name":"Freeze","desc":"Pre-freeze material to make trichomes brittle and easier to separate.","input":"dry_trim","output":"dry_trim","equip":"","yield":100,"hours":12,"handsOn":0.25},
        {"name":"Sift","desc":"Run through 100-160u screens, collect by grade.","input":"dry_trim","output":"dry_sift","equip":"","yield":4,"hours":2,"handsOn":2}
    ]'::jsonb
);

-- ═══════════════════════════════════════════════════════════════════════
-- BHO / HYDROCARBON PATHWAY
-- ═══════════════════════════════════════════════════════════════════════

-- 7. Fresh Frozen → Live Resin Badder
PERFORM _seed_sop(c.id,
    'BHO: Fresh Frozen to Live Resin Badder',
    'Closed-loop butane/propane extraction, whipped during purge for creamy badder consistency.',
    'bho',
    ARRAY['fresh_frozen'],
    ARRAY['live_resin_badder'],
    500,
    '[
        {"name":"Extract","desc":"Closed-loop hydrocarbon wash. Butane/propane blend through packed column.","input":"fresh_frozen","output":"crude_extract","equip":"closed_loop_extractor","yield":15,"hours":4,"handsOn":2},
        {"name":"Whip Purge","desc":"Whip concentrate during vacuum purge to incorporate air. 90-100°F, 24-36h to full solvent removal.","input":"crude_extract","output":"live_resin_badder","equip":"vacuum_oven","yield":90,"hours":30,"handsOn":1}
    ]'::jsonb
);

-- 8. Fresh Frozen → Live Resin Diamonds & Sauce
PERFORM _seed_sop(c.id,
    'BHO: Fresh Frozen to Live Resin Diamonds & Sauce',
    'Solvent-rich pour into jar, extended room-temp cure until THCA crystals form in terpene sauce.',
    'bho',
    ARRAY['fresh_frozen'],
    ARRAY['live_resin_diamonds', 'live_resin_sauce'],
    500,
    '[
        {"name":"Extract","desc":"Closed-loop hydrocarbon wash.","input":"fresh_frozen","output":"crude_extract","equip":"closed_loop_extractor","yield":15,"hours":4,"handsOn":2},
        {"name":"Pour & Cap","desc":"Pour solvent-rich concentrate into jars, loose cap for slow solvent release.","input":"crude_extract","output":"crude_extract","equip":"","yield":99,"hours":1,"handsOn":1},
        {"name":"Cold Cure","desc":"2-4 week room-temp cure to grow THCA diamonds in terpene sauce matrix.","input":"crude_extract","output":"live_resin_diamonds","equip":"","yield":92,"hours":336,"handsOn":0.5},
        {"name":"Separate & Purge","desc":"Drain sauce from diamonds, vacuum purge each separately to remove residual solvent.","input":"live_resin_diamonds","output":"live_resin_diamonds","equip":"vacuum_oven","yield":95,"hours":24,"handsOn":1}
    ]'::jsonb
);

-- 9. Fresh Frozen → Live Resin Sugar
PERFORM _seed_sop(c.id,
    'BHO: Fresh Frozen to Live Resin Sugar',
    'Warm cure during purge produces granular crystalline sugar texture.',
    'bho',
    ARRAY['fresh_frozen'],
    ARRAY['live_resin_sugar'],
    500,
    '[
        {"name":"Extract","desc":"Closed-loop hydrocarbon wash.","input":"fresh_frozen","output":"crude_extract","equip":"closed_loop_extractor","yield":15,"hours":4,"handsOn":2},
        {"name":"Warm Cure Purge","desc":"Vacuum purge at 85-95°F, stir periodically. Sugar texture develops over 48-72h.","input":"crude_extract","output":"live_resin_sugar","equip":"vacuum_oven","yield":90,"hours":60,"handsOn":1}
    ]'::jsonb
);

-- 10. Fresh Frozen → Live Resin Shatter
PERFORM _seed_sop(c.id,
    'BHO: Fresh Frozen to Live Resin Shatter',
    'Thin-film vacuum purge for stable, glass-like live resin shatter.',
    'bho',
    ARRAY['fresh_frozen'],
    ARRAY['live_resin_shatter'],
    500,
    '[
        {"name":"Extract","desc":"Closed-loop hydrocarbon wash.","input":"fresh_frozen","output":"crude_extract","equip":"closed_loop_extractor","yield":15,"hours":4,"handsOn":2},
        {"name":"Thin Film Purge","desc":"Pour onto parchment, thin film vacuum purge at 85-95°F for 48-72h. Do not disturb — stable glass consistency.","input":"crude_extract","output":"live_resin_shatter","equip":"vacuum_oven","yield":90,"hours":60,"handsOn":0.5}
    ]'::jsonb
);

-- 11. Dry Trim → Shatter
PERFORM _seed_sop(c.id,
    'BHO: Dry Trim to Shatter',
    'Classic dry material shatter. Includes dewax step for cold trim or concentrate destined for stable shatter.',
    'bho',
    ARRAY['dry_trim', 'trim'],
    ARRAY['shatter'],
    500,
    '[
        {"name":"Extract","desc":"Closed-loop hydrocarbon wash through dry material.","input":"dry_trim","output":"crude_extract","equip":"closed_loop_extractor","yield":12,"hours":4,"handsOn":2},
        {"name":"Dewax","desc":"Freeze to -20°F or lower to precipitate fats and waxes, filter out before purge.","input":"crude_extract","output":"crude_extract","equip":"","yield":90,"hours":12,"handsOn":0.5},
        {"name":"Thin Film Purge","desc":"Thin film vacuum purge at 90-100°F, 48-72h to stable shatter.","input":"crude_extract","output":"shatter","equip":"vacuum_oven","yield":92,"hours":60,"handsOn":0.5}
    ]'::jsonb
);

-- 12. Dry Trim → Wax / Budder
PERFORM _seed_sop(c.id,
    'BHO: Dry Trim to Wax / Budder',
    'Whipped purge for opaque, soft wax or creamy budder texture.',
    'bho',
    ARRAY['dry_trim', 'trim'],
    ARRAY['wax'],
    500,
    '[
        {"name":"Extract","desc":"Closed-loop hydrocarbon wash.","input":"dry_trim","output":"crude_extract","equip":"closed_loop_extractor","yield":12,"hours":4,"handsOn":2},
        {"name":"Whip Purge","desc":"Whip during vacuum purge. 90-100°F for 24-36h. Creamy, opaque end state.","input":"crude_extract","output":"wax","equip":"vacuum_oven","yield":90,"hours":30,"handsOn":1}
    ]'::jsonb
);

-- 13. Dry Trim → Crumble
PERFORM _seed_sop(c.id,
    'BHO: Dry Trim to Crumble',
    'Higher-temperature vacuum purge produces dry, crumbly honeycomb texture.',
    'bho',
    ARRAY['dry_trim', 'trim'],
    ARRAY['crumble'],
    500,
    '[
        {"name":"Extract","desc":"Closed-loop hydrocarbon wash.","input":"dry_trim","output":"crude_extract","equip":"closed_loop_extractor","yield":12,"hours":4,"handsOn":2},
        {"name":"High Temp Purge","desc":"Vacuum purge at 110-125°F for 48-72h until crumbly, dry consistency.","input":"crude_extract","output":"crumble","equip":"vacuum_oven","yield":88,"hours":60,"handsOn":0.5}
    ]'::jsonb
);

-- 14. Fresh Frozen → Live Resin Pens
PERFORM _seed_sop(c.id,
    'BHO: Fresh Frozen to Live Resin Pens',
    'Full vape pipeline — extract, purge, decarb, fill disposable pens.',
    'bho',
    ARRAY['fresh_frozen'],
    ARRAY['live_resin_pen'],
    500,
    '[
        {"name":"Extract","desc":"Closed-loop hydrocarbon wash.","input":"fresh_frozen","output":"crude_extract","equip":"closed_loop_extractor","yield":15,"hours":4,"handsOn":2},
        {"name":"Purge","desc":"Vacuum purge to remove residual solvent. 90°F, 24-36h.","input":"crude_extract","output":"live_resin","equip":"vacuum_oven","yield":90,"hours":30,"handsOn":1},
        {"name":"Decarb","desc":"Activate cannabinoids — ~220°F, 30-45 min.","input":"live_resin","output":"live_resin","equip":"vacuum_oven","yield":95,"hours":1,"handsOn":0.5},
        {"name":"Fill Pens","desc":"Fill disposable vape pens, cap, label.","input":"live_resin","output":"live_resin_pen","equip":"cart_filler","yield":95,"hours":2,"handsOn":2}
    ]'::jsonb
);

-- ═══════════════════════════════════════════════════════════════════════
-- DISTILLATE PATHWAY
-- ═══════════════════════════════════════════════════════════════════════

-- 15. Trim → Distillate (full pipeline)
PERFORM _seed_sop(c.id,
    'Distillate: Trim to Distillate',
    'Full ethanol extraction pipeline — extract, winterize, filter, recover, distill.',
    'distillate',
    ARRAY['trim', 'shake', 'dry_trim'],
    ARRAY['distillate'],
    500,
    '[
        {"name":"Extract","desc":"Ethanol soak extraction, cold to reduce chlorophyll pickup.","input":"trim","output":"crude_extract","equip":"closed_loop_extractor","yield":12,"hours":4,"handsOn":2},
        {"name":"Winterize","desc":"Dissolve crude in ethanol, freeze overnight to precipitate fats and waxes.","input":"crude_extract","output":"crude_extract","equip":"","yield":85,"hours":14,"handsOn":0.5},
        {"name":"Filter","desc":"Buchner/filter press to remove precipitated waxes.","input":"crude_extract","output":"crude_extract","equip":"filter_press","yield":95,"hours":2,"handsOn":1},
        {"name":"Recover Ethanol","desc":"Rotovap ethanol off for recycling. Leaves decarboxylated crude oil.","input":"crude_extract","output":"crude_extract","equip":"","yield":95,"hours":4,"handsOn":1},
        {"name":"Distill","desc":"Short-path distillation. First pass terpenes, second pass main body.","input":"crude_extract","output":"distillate","equip":"short_path","yield":80,"hours":6,"handsOn":2}
    ]'::jsonb
);

-- 16. Trim → Distillate Carts
PERFORM _seed_sop(c.id,
    'Distillate: Trim to Distillate Carts',
    'Full pipeline from trim to filled cartridges, including optional terpene reintroduction.',
    'distillate',
    ARRAY['trim', 'shake', 'dry_trim'],
    ARRAY['distillate_cart'],
    500,
    '[
        {"name":"Extract","desc":"Ethanol soak extraction.","input":"trim","output":"crude_extract","equip":"closed_loop_extractor","yield":12,"hours":4,"handsOn":2},
        {"name":"Winterize","desc":"Freeze overnight to precipitate waxes.","input":"crude_extract","output":"crude_extract","equip":"","yield":85,"hours":14,"handsOn":0.5},
        {"name":"Filter","desc":"Filter press.","input":"crude_extract","output":"crude_extract","equip":"filter_press","yield":95,"hours":2,"handsOn":1},
        {"name":"Recover","desc":"Rotovap ethanol off.","input":"crude_extract","output":"crude_extract","equip":"","yield":95,"hours":4,"handsOn":1},
        {"name":"Distill","desc":"Short-path distillation.","input":"crude_extract","output":"distillate","equip":"short_path","yield":80,"hours":6,"handsOn":2},
        {"name":"Terpene Reintro","desc":"Add 3-8% terpenes back for flavor and viscosity.","input":"distillate","output":"distillate","equip":"","yield":100,"hours":0.5,"handsOn":0.5,"optional":true},
        {"name":"Fill Carts","desc":"Heated fill at 140-160°F. Cap and label.","input":"distillate","output":"distillate_cart","equip":"cart_filler","yield":95,"hours":3,"handsOn":3}
    ]'::jsonb
);

-- 17. Crude → Distillate (starting from BHO crude)
PERFORM _seed_sop(c.id,
    'Distillate: Crude to Distillate',
    'Second-pass refinement for BHO-produced crude. Skip the initial extraction — start from winterization.',
    'distillate',
    ARRAY['crude_extract'],
    ARRAY['distillate'],
    500,
    '[
        {"name":"Winterize","desc":"Dissolve in ethanol, freeze overnight.","input":"crude_extract","output":"crude_extract","equip":"","yield":85,"hours":14,"handsOn":0.5},
        {"name":"Filter","desc":"Filter press to remove waxes.","input":"crude_extract","output":"crude_extract","equip":"filter_press","yield":95,"hours":2,"handsOn":1},
        {"name":"Recover","desc":"Rotovap ethanol off.","input":"crude_extract","output":"crude_extract","equip":"","yield":95,"hours":4,"handsOn":1},
        {"name":"Distill","desc":"Short-path distillation.","input":"crude_extract","output":"distillate","equip":"short_path","yield":82,"hours":6,"handsOn":2}
    ]'::jsonb
);

-- 18. Trim → Isolate
PERFORM _seed_sop(c.id,
    'Distillate: Trim to Isolate',
    'Distillate refined further to crystalline isolate (THCA or CBD). Adds a crystallization step after distillation.',
    'distillate',
    ARRAY['trim', 'shake', 'dry_trim'],
    ARRAY['isolate'],
    500,
    '[
        {"name":"Extract","desc":"Ethanol soak extraction.","input":"trim","output":"crude_extract","equip":"closed_loop_extractor","yield":12,"hours":4,"handsOn":2},
        {"name":"Winterize","desc":"Freeze overnight.","input":"crude_extract","output":"crude_extract","equip":"","yield":85,"hours":14,"handsOn":0.5},
        {"name":"Filter","desc":"Filter press.","input":"crude_extract","output":"crude_extract","equip":"filter_press","yield":95,"hours":2,"handsOn":1},
        {"name":"Recover","desc":"Rotovap ethanol off.","input":"crude_extract","output":"crude_extract","equip":"","yield":95,"hours":4,"handsOn":1},
        {"name":"Distill","desc":"Short-path distillation.","input":"crude_extract","output":"distillate","equip":"short_path","yield":80,"hours":6,"handsOn":2},
        {"name":"Crystallize","desc":"Dissolve in pentane/hexane, slow evaporation to grow THCA or CBD crystals. Wash and dry.","input":"distillate","output":"isolate","equip":"","yield":70,"hours":48,"handsOn":3}
    ]'::jsonb
);

-- ═══════════════════════════════════════════════════════════════════════
-- CUSTOM / INFUSED PATHWAY
-- ═══════════════════════════════════════════════════════════════════════

-- 19. Pre-Roll Pack
PERFORM _seed_sop(c.id,
    'Custom: Pre-Roll Pack',
    'Grind flower, fill cones, weigh, pack, label. Standard pre-roll production run.',
    'custom',
    ARRAY['flower', 'shake'],
    ARRAY['preroll'],
    500,
    '[
        {"name":"Grind","desc":"Mill flower to consistent grind size. Remove stems.","input":"flower","output":"flower","equip":"","yield":98,"hours":1,"handsOn":1},
        {"name":"Fill Cones","desc":"Fill pre-rolled cones to target weight (0.5g or 1g typical).","input":"flower","output":"preroll","equip":"","yield":96,"hours":3,"handsOn":3},
        {"name":"Pack & Label","desc":"Tamp, twist, label individual pre-rolls. Pack into retail containers.","input":"preroll","output":"preroll","equip":"","yield":99,"hours":2,"handsOn":2}
    ]'::jsonb
);

-- 20. Infused Pre-Rolls
PERFORM _seed_sop(c.id,
    'Custom: Infused Pre-Rolls',
    'Pre-rolls infused with distillate or rosin and dusted with kief for higher potency.',
    'custom',
    ARRAY['flower'],
    ARRAY['preroll_infused'],
    500,
    '[
        {"name":"Grind","desc":"Mill flower to consistent size.","input":"flower","output":"flower","equip":"","yield":98,"hours":1,"handsOn":1},
        {"name":"Fill Cones","desc":"Fill pre-rolled cones to target weight.","input":"flower","output":"preroll","equip":"","yield":96,"hours":3,"handsOn":3},
        {"name":"Infuse","desc":"Apply distillate, rosin, or other concentrate to the outside of the cone or mixed into the grind.","input":"preroll","output":"preroll_infused","equip":"","yield":99,"hours":2,"handsOn":2},
        {"name":"Dust with Kief","desc":"Roll infused pre-roll in kief for extra potency and visual appeal.","input":"preroll_infused","output":"preroll_infused","equip":"","yield":99,"hours":1,"handsOn":1,"optional":true},
        {"name":"Package","desc":"Label, box, compliance check.","input":"preroll_infused","output":"preroll_infused","equip":"","yield":100,"hours":1,"handsOn":1}
    ]'::jsonb
);

END LOOP;
END $$;

-- ── Clean up helper function ─────────────────────────────────────────────
DROP FUNCTION _seed_sop(UUID, TEXT, TEXT, TEXT, TEXT[], TEXT[], INT, JSONB);
