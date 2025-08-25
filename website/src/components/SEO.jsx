import React from "react";
import { Title, Meta, Link } from "react-head";

const SEO = ({ title, description, canonical, schema }) => {
    return (
        <>
            {title && <Title>{title}</Title>}
            {description && <Meta name="description" content={description} />}
            {canonical && <Link rel="canonical" href={canonical} />}

            {/* Basic SEO */}
            <Meta name="robots" content="index, follow" />

            {/* Open Graph for social sharing */}
            <Meta property="og:title" content={title} />
            <Meta property="og:description" content={description} />
            {canonical && <Meta property="og:url" content={canonical} />}
            <Meta property="og:type" content="website" />

            {/* Twitter Cards */}
            <Meta name="twitter:card" content="summary_large_image" />
            <Meta name="twitter:title" content={title} />
            <Meta name="twitter:description" content={description} />

            {/* Structured Data (JSON-LD) */}
            {schema && (
                <script type="application/ld+json">
                    {JSON.stringify(schema)}
                </script>
            )}
        </>
    );
};

export default SEO;
