import React, { useEffect } from "react";
import { Title, Meta, Link } from "react-head";

const SEO = ({
    title = "Expensease – Split & Track Expenses Easily",
    description = "Split expenses, track spending, and manage group finances effortlessly with Expensease.",
    canonical = "https://www.expensease.in",
    image = "/image.png",
    type = "website",
    schema,
}) => {
    const fullTitle = title.includes("Expensease") ? title : `${title} | Expensease`;

    // Basic fallback for crawlers before React hydration
    useEffect(() => {
        document.title = fullTitle;
        const canonicalTag = document.querySelector("link[rel='canonical']");
        if (canonicalTag) canonicalTag.href = canonical;
    }, [fullTitle, canonical]);

    return (
        <>
            <Title>{fullTitle}</Title>
            <Meta name="description" content={description} />
            <Link rel="canonical" href={canonical} />
            <Meta name="robots" content="index, follow" />

            {/* OG Meta */}
            <Meta property="og:type" content={type} />
            <Meta property="og:title" content={fullTitle} />
            <Meta property="og:description" content={description} />
            <Meta property="og:url" content={canonical} />
            <Meta property="og:image" content={image} />

            {/* Twitter */}
            <Meta name="twitter:card" content="summary_large_image" />
            <Meta name="twitter:title" content={fullTitle} />
            <Meta name="twitter:description" content={description} />
            <Meta name="twitter:image" content={image} />

            {/* Structured Data */}
            {schema && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(schema, null, 2),
                    }}
                />
            )}
        </>
    );
};

export default SEO;
